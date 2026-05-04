变更文件：[.obsidian/plugins/obsidian-jupyter-launcher/main.js](app://obsidian.md/.obsidian/plugins/obsidian-jupyter-launcher/main.js)

我把启动参数从：

```js
'--ServerApp.token=' + token,
```

js

改成了：

```js
'--IdentityProvider.token=' + token,
```

js

也已备份：

```text
.obsidian\plugins\obsidian-jupyter-launcher\main.js.bak-before-identityprovider-token-20260504
```

text

验证结果：

```text
Select-String 只剩 --IdentityProvider.token
node --check 通过
```

text

下一步：需要让插件重新加载才会生效。最简单：

1. Obsidian 里按 `Ctrl + R` 重载窗口
2. 或关闭/重新开启 Jupyter Launcher 插件
3. 重新启动 JupyterLab

注意：已经启动中的 Jupyter 进程不会自动变更参数，要下次启动才会用新参数。