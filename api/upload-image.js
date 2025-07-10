// feishu-proxy/api/upload-image.js

import FormData from 'form-data'; // 顶部引入 form-data 包

let cachedToken = null;
let tokenExpireAt = 0;

const appId = 'cli_a6690ce77472500e'; // 你的 App ID
const appSecret = 'JPDFQ4tWZHQRD2gh9B1Dhfukxe1rqX0c'; // 你的 App Secret

async function getTenantAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpireAt > now + 60 * 1000) {
    return cachedToken;
  }
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
  // CORS 头
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

  const { base64 } = req.body;
  if (!base64) {
    res.status(400).json({ success: false, message: '缺少 base64 参数' });
    return;
  }

  try {
    const token = await getTenantAccessToken();
    // 用 form-data 构造 multipart/form-data
    const form = new FormData();
    form.append('image', Buffer.from(base64, 'base64'), {
      filename: 'component.png',
      contentType: 'image/png'
    });

    const resp = await fetch('https://open.feishu.cn/open-apis/image/v4/put/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        ...form.getHeaders()
      },
      body: form
    });
    const data = await resp.json();
    if (data.code === 0 && data.data && data.data.image_key) {
      res.status(200).json({ success: true, url: `image://${data.data.image_key}` });
    } else {
      res.status(500).json({ success: false, message: data.msg || '上传失败', feishu: data });
    }
  } catch (e) {
    console.error('upload-image error:', e, e?.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: e.message, stack: e.stack });
    }
  }
}
