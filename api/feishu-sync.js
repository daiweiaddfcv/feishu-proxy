{\rtf1\ansi\ansicpg936\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\froman\fcharset0 Times-Roman;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;}
{\*\expandedcolortbl;;\cssrgb\c0\c0\c0;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\fs24 \cf0 \expnd0\expndtw0\kerning0
\outl0\strokewidth0 \strokec2 // api/feishu-sync.js\
export default async function handler(req, res) \{\
  if (req.method !== 'POST') \{\
    res.status(405).json(\{ error: 'Method Not Allowed' \});\
    return;\
  \}\
\
  // 1. \uc0\u20320 \u30340 \u39134 \u20070 \u21442 \u25968 \
  const token = 't-g10479eCYDWZ3WGH4FA3HZGJCCV6QXHT5BV23HRK';\
  const appToken = 'SFMCw9J8Ri8eQGkZJofczNO1n6g';\
  const tableId = 'tbloO7oEhgssSlxj';\
\
  // 2. \uc0\u33719 \u21462  Figma \u25554 \u20214 \u21457 \u26469 \u30340 \u25968 \u25454 \
  const \{ records \} = req.body;\
\
  // 3. \uc0\u35831 \u27714 \u39134 \u20070  API\
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/$\{appToken\}/tables/$\{tableId\}/records/batch_create`;\
  try \{\
    const feishuRes = await fetch(url, \{\
      method: 'POST',\
      headers: \{\
        'Authorization': 'Bearer ' + token,\
        'Content-Type': 'application/json'\
      \},\
      body: JSON.stringify(\{ records \})\
    \});\
    const result = await feishuRes.json();\
    if (result.code === 0) \{\
      res.status(200).json(\{ success: true, message: '\uc0\u21516 \u27493 \u25104 \u21151 ', feishu: result \});\
    \} else \{\
      res.status(500).json(\{ success: false, message: result.msg || '\uc0\u39134 \u20070 API\u38169 \u35823 ', feishu: result \});\
    \}\
  \} catch (e) \{\
    res.status(500).json(\{ success: false, message: e.message \});\
  \}\
\}\
}