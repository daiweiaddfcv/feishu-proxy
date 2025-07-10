// 1. 先定义 token 缓存和飞书 App 信息
let cachedToken = null;
let tokenExpireAt = 0;

const appId = 'cli_a6690ce77472500e'; // 你的 App ID
const appSecret = 'JPDFQ4tWZHQRD2gh9B1Dhfukxe1rqX0c'; // 你的 App Secret

// 2. getTenantAccessToken 函数
async function getTenantAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpireAt > now + 60 * 1000) { // 提前1分钟刷新
    return cachedToken;
  }
  // 获取新 token
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });
  const data = await res.json();
  if (data.tenant_access_token) {
    cachedToken = data.tenant_access_token;
    tokenExpireAt = now + (data.expire * 1000);
    return cachedToken;
  } else {
    throw new Error('获取 tenant_access_token 失败: ' + (data.msg || JSON.stringify(data)));
  }
}

// 3. handler 函数（你的代码，保持不变）
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // 你的多维表格参数
  const appToken = 'QnyYbNI4aaroOpsNTOwc8Bx0nLg';
  const tableId = 'tbloUQTN9kvStqsS';

  const { records } = req.body;

  try {
    // 1. 获取当前表格所有“组件名称”
    const token = await getTenantAccessToken();
    let existNames = new Set();
    let hasMore = true;
    let pageToken = '';
    while (hasMore) {
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100${pageToken ? `&page_token=${pageToken}` : ''}`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      const data = await resp.json();
      if (data.data && data.data.items) {
        for (const item of data.data.items) {
          if (item.fields && item.fields['组件名称']) {
            existNames.add(item.fields['组件名称']);
          }
        }
      }
      hasMore = data.data && data.data.has_more;
      pageToken = hasMore ? data.data.page_token : '';
    }

    // 2. 过滤掉已存在的组件名称
    const newRecords = records.filter(r => !existNames.has(r.fields['组件名称']));

    if (newRecords.length === 0) {
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
      const feishuRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      });
      const result = await feishuRes.json();
      allResults.push(result);
      if (result.code === 0) {
        totalSuccess += batch.length;
      } else {
        // 某一批失败，立即返回
        res.status(500).json({ success: false, message: result.msg || '飞书API错误', feishu: result, batchIndex: Math.floor(i / BATCH_SIZE) + 1 });
        return;
      }
    }

    // 全部批次成功
    res.status(200).json({
      success: true,
      message: `成功导入${totalSuccess}条新组件（共${allResults.length}批）`,
      feishu: allResults
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}
