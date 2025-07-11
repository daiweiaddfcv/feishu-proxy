export default async function handler(req, res) {
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
    // 兼容 JSON body 和字符串 body
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
    res.status(400).json({ success: false, message: '请求体解析失败', error: parseErr.message });
    return;
  }

  console.log('[feishu-sync] 收到请求', { recordsCount: records?.length, appToken, tableId });

  if (!appToken || !tableId) {
    console.error('[feishu-sync] 缺少 appToken 或 tableId 参数', { appToken, tableId });
    res.status(400).json({ 
      success: false, 
      message: '缺少 appToken 或 tableId 参数' 
    });
    return;
  }

  try {
    // 1. 获取当前表格所有“组件名称”
    const token = await getTenantAccessToken();
    let existNames = new Set();
    let hasMore = true;
    let pageToken = '';
    let totalFetched = 0;
    while (hasMore) {
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100${pageToken ? `&page_token=${pageToken}` : ''}`;
      console.log('[feishu-sync] 拉取表格数据:', url);
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      const data = await resp.json();
      console.log('[feishu-sync] 拉取返回:', JSON.stringify(data));
      if (data.data && data.data.items) {
        for (const item of data.data.items) {
          if (item.fields && item.fields['组件名称']) {
            existNames.add(item.fields['组件名称']);
          }
        }
        totalFetched += data.data.items.length;
      }
      hasMore = data.data && data.data.has_more;
      pageToken = hasMore ? data.data.page_token : '';
    }
    console.log('[feishu-sync] 已有组件名称数量:', existNames.size, '总拉取记录数:', totalFetched);

    // 2. 过滤掉已存在的组件名称
    const newRecords = records.filter(r => !existNames.has(r.fields['组件名称']));
    console.log('[feishu-sync] 需写入新组件数量:', newRecords.length);

    if (newRecords.length === 0) {
      console.log('[feishu-sync] 全部组件已存在，无需同步');
      res.status(200).json({ success: true, message: '全部组件已存在，无需同步' });
      return;
    }

    // 3. 分批写入新组件
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
        res.status(500).json({ success: false, message: result.msg || '飞书API错误', feishu: result, batchIndex: Math.floor(i / BATCH_SIZE) + 1 });
        return;
      }
    }

    console.log('[feishu-sync] 全部批次写入完成，总成功:', totalSuccess);
    res.status(200).json({
      success: true,
      message: `成功导入${totalSuccess}条新组件（共${allResults.length}批）`,
      feishu: allResults
    });
  } catch (e) {
    console.error('[feishu-sync] 云函数捕获到错误:', e, e?.stack);
    res.status(500).json({ success: false, message: e.message, error: e.stack });
  }
}
