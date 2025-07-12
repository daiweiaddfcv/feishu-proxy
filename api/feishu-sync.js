import getTenantAccessToken from '../feishu-token/getTenantAccessToken.js';
import FormData from 'form-data';

async function uploadToFeishuDrive(base64, fileName, tenantAccessToken) {
  const form = new FormData();
  form.append('file_name', fileName);
  form.append('parent_type', 'explorer');
  form.append('parent_node', '0');
  form.append('file', Buffer.from(base64, 'base64'), {
    filename: fileName,
    contentType: 'image/png'
  });
  const resp = await fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_all', {
    method: 'POST',
    headers: {
      ...form.getHeaders(),
      'Authorization': 'Bearer ' + tenantAccessToken,
    },
    body: form
  });
  const data = await resp.json();
  if (data.code === 0 && data.data && data.data.file_token) {
    return data.data.file_token;
  } else {
    console.error('[feishu-sync] 上传图片失败:', data);
    return '';
  }
}

export default async function handler(req, res) {
  console.log('[feishu-sync] handler 进入');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('[feishu-sync] 收到 OPTIONS 预检请求');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.warn('[feishu-sync] 非法请求方法:', req.method);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let records, appToken, tableId;
  try {
    if (typeof req.body === 'string') {
      console.log('[feishu-sync] 尝试解析字符串 body');
      const parsed = JSON.parse(req.body);
      records = parsed.records;
      appToken = parsed.appToken;
      tableId = parsed.tableId;
    } else {
      ({ records, appToken, tableId } = req.body);
    }
  } catch (parseErr) {
    console.error('[feishu-sync] 解析 body 失败:', req.body, parseErr);
    res.status(400).json({ success: false, message: '请求体解析失败', error: parseErr.message, debug: { records } });
    return;
  }

  console.log('[feishu-sync] 收到请求', { recordsCount: records?.length, appToken, tableId });

  if (!appToken || !tableId) {
    console.error('[feishu-sync] 缺少 appToken 或 tableId 参数', { appToken, tableId });
    res.status(400).json({ 
      success: false, 
      message: '缺少 appToken 或 tableId 参数',
      debug: { records }
    });
    return;
  }

  try {
    const token = await getTenantAccessToken();
    // 收集所有 file_token 便于调试
    let fileTokenList = [];
    // 组装新 records，云端上传图片，回填 file_token
    console.log('[feishu-sync] 收到 records:', JSON.stringify(records));
    const newRecords = await Promise.all(records.map(async (rec, idx) => {
      let fileToken = '';
      if (rec.thumbnail) {
        fileToken = await uploadToFeishuDrive(rec.thumbnail, `component_${idx}.png`, token);
        console.log(`[feishu-sync] 第${idx}条记录上传图片结果 fileToken:`, fileToken);
      } else {
        console.warn(`[feishu-sync] 第${idx}条记录没有 thumbnail，无法上传图片`);
      }
      if (fileToken) fileTokenList.push(fileToken);
      // 写入表格前彻底删除 fields.thumbnail
      if (rec.fields && rec.fields.thumbnail) delete rec.fields.thumbnail;
      return {
        fields: {
          ...rec.fields,
          "组件截图": fileToken ? [{ file_token: fileToken }] : [],
        }
      };
    }));
    console.log('[feishu-sync] 生成的新 records:', JSON.stringify(newRecords));
    console.log('[feishu-sync] fileTokenList:', fileTokenList);

    // ====== 可选：如果你有“全部组件已存在，无需同步”判断，放在这里 ======
    // if (xxx) {
    //   res.status(200).json({
    //     success: true,
    //     message: "全部组件已存在，无需同步",
    //     syncedCount: 0,
    //     debug: { records }
    //   });
    //   return;
    // }
    // ===========================================================

    // 分批写入新组件
    const BATCH_SIZE = 500;
    let allResults = [];
    let totalSuccess = 0;
    for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
      const batch = newRecords.slice(i, i + BATCH_SIZE);
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
      console.log('[feishu-sync] 正在写入第', Math.floor(i / BATCH_SIZE) + 1, '批，数量:', batch.length);
      const feishuRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      });
      const result = await feishuRes.json();
      console.log('[feishu-sync] 飞书API返回:', JSON.stringify(result));
      allResults.push(result);
      if (result.code === 0) {
        totalSuccess += batch.length;
      } else {
        console.error('[feishu-sync] 飞书API错误:', result);
        res.status(500).json({ success: false, message: result.msg || '飞书API错误', feishu: result, batchIndex: Math.floor(i / BATCH_SIZE) + 1, debug: { records } });
        return;
      }
    }
    console.log('[feishu-sync] 全部批次写入完成，总成功:', totalSuccess);
    res.status(200).json({
      success: true,
      message: `成功导入${totalSuccess}条新组件（共${allResults.length}批）`,
      feishu: allResults,
      debug: { fileTokenList, newRecords, records }
    });
  } catch (e) {
    console.error('[feishu-sync] 云函数捕获到错误:', e, e?.stack);
    res.status(500).json({ success: false, message: e.message, error: e.stack, debug: { records } });
  }
}
