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

  // 你的飞书参数
  const token = 't-g10479eCYDWZ3WGH4FA3HZGJCCV6QXHT5BV23HRK';
  const appToken = 'SFMCw9J8Ri8eQGkZJofczNO1n6g';
  const tableId = 'tbloO7oEhgssSlxj';

  // 获取 Figma 插件发来的数据
  const { records } = req.body;

  // 请求飞书 API
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
  try {
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
