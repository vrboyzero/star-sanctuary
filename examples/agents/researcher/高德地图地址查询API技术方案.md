# 高德地图地址查询 API 技术方案调研报告

## 一、API 概述

高德地图 Web 服务 API 提供地理编码/逆地理编码接口，通过 HTTP/HTTPS 协议实现结构化地址与经纬度坐标之间的相互转换。

**核心能力：**
- **地理编码**：将结构化地址（如"北京市朝阳区阜通东大街6号"）转换为经纬度坐标
- **逆地理编码**：将经纬度坐标转换为详细地址，并返回周边 POI/AOI 信息

---

## 二、API Key 申请流程

### 1. 注册登录
访问 [高德开放平台](https://lbs.amap.com/) 完成账号注册和登录。

### 2. 创建应用
- 进入控制台 → 应用管理 → 创建新应用
- 填写应用名称和类型

### 3. 添加 Key
- 在应用下点击"添加 Key"
- 选择服务平台：**Web 服务**
- 填写 Key 名称
- 生成后获得 API Key（用于接口认证）

### 4. 配置（可选）
- **IP 白名单**：限制调用来源 IP（未设置则不限制）
- **数字签名**：开启后需按算法生成签名参数

**官方文档：** https://lbs.amap.com/dev/key

---

## 三、API 端点和认证方式

### 认证方式
所有请求通过 **Query 参数** 传递 API Key：
```
?key=YOUR_API_KEY
```

### 地理编码接口

**端点：**
```
GET https://restapi.amap.com/v3/geocode/geo
```

**核心参数：**

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| key | string | ✅ | API Key | - |
| address | string | ✅ | 结构化地址信息 | 北京市朝阳区阜通东大街6号 |
| city | string | ❌ | 指定查询城市（中文/拼音/citycode/adcode） | 北京 / beijing / 010 / 110000 |
| output | string | ❌ | 返回格式（JSON/XML），默认 JSON | JSON |
| callback | string | ❌ | JSONP 回调函数名 | - |
| batch | boolean | ❌ | 批量查询（最多10个地址，用"\|"分隔） | true |

**请求示例：**
```bash
GET https://restapi.amap.com/v3/geocode/geo?address=北京市朝阳区阜通东大街6号&city=北京&key=YOUR_API_KEY
```

**响应示例：**
```json
{
    "status": "1",
    "info": "OK",
    "infocode": "10000",
    "count": "1",
    "geocodes": [
        {
            "formatted_address": "北京市朝阳区阜通东大街6号",
            "country": "中国",
            "province": "北京市",
            "citycode": "010",
            "city": "北京市",
            "district": "朝阳区",
            "township": [],
            "street": "阜通东大街",
            "number": "6号",
            "location": "116.482086,39.990496",
            "level": "门牌号"
        }
    ]
}
```

---

### 逆地理编码接口

**端点：**
```
GET https://restapi.amap.com/v3/geocode/regeo
```

**核心参数：**

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| key | string | ✅ | API Key | - |
| location | string | ✅ | 经纬度坐标（经度在前，纬度在后） | 116.481488,39.990464 |
| poitype | string | ❌ | 返回附近 POI 类型（多个用"\|"分隔） | 商务住宅\|餐饮服务 |
| radius | number | ❌ | 搜索半径（米），默认1000，最大3000 | 1000 |
| extensions | string | ❌ | 返回结果详细程度（base/all），默认 base | all |
| batch | boolean | ❌ | 批量查询（最多20个坐标，用"\|"分隔） | true |
| roadlevel | number | ❌ | 道路等级（0=所有道路，1=主要道路） | 0 |
| output | string | ❌ | 返回格式（JSON/XML），默认 JSON | JSON |

**请求示例：**
```bash
GET https://restapi.amap.com/v3/geocode/regeo?location=116.481488,39.990464&key=YOUR_API_KEY&radius=1000&extensions=all
```

**响应示例：**
```json
{
    "status": "1",
    "info": "OK",
    "infocode": "10000",
    "regeocode": {
        "formatted_address": "北京市朝阳区望京街道方恒国际中心B座方恒国际",
        "addressComponent": {
            "country": "中国",
            "province": "北京市",
            "city": [],
            "citycode": "010",
            "district": "朝阳区",
            "adcode": "110105",
            "township": "望京街道",
            "towncode": "110105026000",
            "streetNumber": {
                "street": "阜通东大街",
                "number": "6号",
                "location": "116.482086,39.990496",
                "direction": "东",
                "distance": "51.0778"
            },
            "businessAreas": [
                {
                    "location": "116.470293,39.996171",
                    "name": "望京",
                    "id": "110105"
                }
            ]
        },
        "pois": [
            {
                "id": "B000A7HFVV",
                "name": "方恒国际B座",
                "type": "商务住宅;楼宇;商务写字楼",
                "tel": "010-84718888",
                "direction": "西",
                "distance": "40.4263",
                "location": "116.481018,39.990414",
                "address": "阜通东大街6号"
            }
        ],
        "roads": [
            {
                "id": "010J50F0010203327",
                "name": "阜通东大街",
                "direction": "东南",
                "distance": "61.2781",
                "location": "116.481,39.9908"
            }
        ]
    }
}
```

---

## 四、限流与配额

### 日调用量限制

| 能力名称 | 个人开发者（次/天） | 企业开发者（次/天） |
|----------|---------------------|---------------------|
| 地理编码 | 5,000 | 3,000,000 |
| 逆地理编码 | 5,000 | 3,000,000 |

### QPS 限制
- 默认 QPS 配额可在 [控制台-流量分析-配额管理](https://console.amap.com/dev/flow/manage) 查看
- 超出 QPS 限制时，超出部分请求被拒绝，限流阈值内请求正常返回

### 限流错误码

| 错误码 | 说明 | 恢复方式 |
|--------|------|----------|
| 10003 | 日访问量超限 | 次日 0:00 自动解封 |
| 10004 | 单位时间（1分钟）访问过于频繁 | 下一分钟自动解封 |
| 10010 | 单个 IP 访问超限（未设置白名单） | 需提交工单恢复 |
| 10014 | 云图服务 QPS 超限 | 降低 QPS 或提交工单 |
| 10015 | 受单机 QPS 限流限制 | 降低 QPS 或提交工单 |
| 10019 | 服务总 QPS 超限 | 降低 QPS 或提交工单 |
| 10020 | 某个 Key 使用某服务 QPS 超限 | 降低 QPS 或提交工单 |
| 10021 | 账号使用某服务 QPS 超限 | 降低 QPS 或提交工单 |

---

## 五、常见错误码

| 错误码 | 说明 | 排查策略 |
|--------|------|----------|
| 10000 | 请求成功 | - |
| 10001 | Key 不正确或过期 | 检查 Key 是否有效 |
| 10002 | 没有权限使用相应服务 | 检查 Key 绑定的服务类型 |
| 10005 | IP 白名单错误 | 检查服务器出口 IP 是否在白名单中 |
| 10009 | 请求 Key 与绑定平台不符 | 确认使用 Web 服务 Key |
| 20000 | 请求参数非法 | 检查参数值是否符合规范 |
| 20001 | 缺少必填参数 | 补充必填参数 |
| 20003 | 其他未知错误 | 检查参数完整性和网络环境 |
| 20011 | 查询坐标在海外但无海外权限 | 申请海外地图权限 |
| 20800 | 规划点不在中国陆地范围内 | 确认坐标位置 |

**完整错误码文档：** https://amap.apifox.cn/doc-541077

---

## 六、最佳实践建议

### 1. 安全性
- ✅ **使用 HTTPS**：所有生产环境请求使用 HTTPS 协议
- ✅ **配置 IP 白名单**：限制调用来源，防止 Key 泄露滥用
- ✅ **开启数字签名**：高安全场景建议启用签名验证
- ❌ **不要在前端暴露 Key**：Web 服务 Key 应在后端调用

### 2. 性能优化
- **批量查询**：支持批量地理编码（最多10个）和批量逆地理编码（最多20个），减少请求次数
- **缓存结果**：对于固定地址/坐标，缓存查询结果避免重复请求
- **异步处理**：大量查询时使用异步队列，控制并发 QPS

### 3. 错误处理
```javascript
// 示例：Node.js 错误处理
async function geocode(address) {
  try {
    const response = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${API_KEY}`
    );
    const data = await response.json();
    
    if (data.status === '1' && data.geocodes.length > 0) {
      return data.geocodes[0].location; // 返回经纬度
    } else {
      console.error(`地理编码失败: ${data.info} (${data.infocode})`);
      return null;
    }
  } catch (error) {
    console.error('请求失败:', error);
    return null;
  }
}
```

### 4. 参数优化
- **地理编码**：指定 `city` 参数可提高查询精度和速度
- **逆地理编码**：
  - 使用 `extensions=all` 获取详细 POI 信息
  - 合理设置 `radius` 参数（默认1000米，最大3000米）
  - 使用 `poitype` 过滤特定类型 POI

### 5. 监控与告警
- 在控制台查看 [流量分析](https://console.amap.com/dev/flow/manage)
- 监控日调用量和 QPS，避免触发限流
- 设置告警阈值（如达到日配额 80% 时预警）

### 6. 坐标系说明
- 高德地图使用 **GCJ-02 坐标系**（火星坐标系）
- 如需与 GPS（WGS-84）或百度地图（BD-09）互转，需使用坐标转换接口

---

## 七、参考资源

- **官方文档**：https://lbs.amap.com/api/webservice/guide/api/georegeo
- **控制台**：https://console.amap.com/dev/index
- **错误码说明**：https://amap.apifox.cn/doc-541077
- **限流说明**：https://amap.apifox.cn/doc-541078
- **API 示例（Apifox）**：https://amap.apifox.cn/api-14546468

---

**调研完成时间：** 2026-02-24  
**调研人员：** 小研 (Researcher Agent)
