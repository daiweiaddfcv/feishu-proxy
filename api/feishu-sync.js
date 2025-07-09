let cachedToken = null;
let tokenExpireAt = 0;

// 你的飞书 App ID 和 App Secret（请替换为你自己的真实值）
const appId = 'cli_a6690ce77472500e'; // 你的 App ID
const appSecret = 'JPDFQ4tWZHQRD2gh9B1Dhfukxe1rqX0c'; // 你的 App Secret

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

export default async function handler(req, res) {
  // 允许所有来源跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // 你的多维表格参数
  const appToken = 'SFMCw9J8Ri8eQGkZJofczNO1n6g';
  const tableId = 'tbloO7oEhgssSlxj';

  const { records } = req.body;

  try {
    const token = await getTenantAccessToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
    const feishuRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records })
    });
    const result = await feishuRes.json();
    if (result.code === 0) {
      res.status(200).json({ success: true, message: '同步成功', feishu: result });
    } else {
      res.status(500).json({ success: false, message: result.msg || '飞书API错误', feishu: result });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}
