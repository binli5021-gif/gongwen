# 公文排版工具

基于 `GB/T 9704` 的党政机关公文在线排版工具，支持实时预览、智能分页和 `DOCX` 导出。

当前这份代码在原仓库基础上增加了更适合中文公文整理场景的增强能力，包括：

- 不规范标题自动识别与规范化
- 标题层级自动统一
- 基层单位落款识别
- 附件名称末尾标点清理
- 无印章落款空一行
- 署名与成文日期避免跨页拆分

🔗 **在线体验：https://hehecat.github.io/gongwen/**

📦 **离线版下载：[Releases](https://github.com/hehecat/gongwen/releases/latest)** — 下载 `gongwen.html`，双击即可使用

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhehecat%2Fgongwen)

## 功能特性

- **实时预览** — 左侧编辑、右侧即时 A4 分页预览
- **智能解析** — 自动识别公文标题、一至四级标题、主送机关、附件说明、成文日期等结构
- **标题纠偏** — 自动将 `1、`、`(一)`、`（1）` 等不规范写法统一为标准公文标题格式
- **层级统一** — 可将同一节下混写的一、二、三、四级标题自动纠偏成统一层级
- **DOCX 导出** — 一键生成符合国标格式的 Word 文档
- **文件导入** — 拖拽或点击导入 .docx / .txt 文件，自动提取纯文本进行格式化洗稿
- **自动净化** — 半角标点自动转全角、多余空白自动清理，无需手动操作
- **附件规范化** — 自动清理附件名称末尾标点，按公文样式排版
- **落款优化** — 支持基层单位署名识别，并避免署名与成文日期被拆到两页
- **版头排版** — 发文机关标志（红色大字）、发文字号与签发人（无边框表格同行对齐）、红色分隔线
- **版记排版** — 抄送机关、印发机关与印发日期（左右对齐），首末粗线 + 中间细线
- **格式可配置** — 页边距、字体、字号、行距、首行缩进等参数均可自定义
- **国标默认值** — 方正小标宋标题、仿宋正文、三号字、29磅行距等开箱即用
- **本地持久化** — 编辑内容与配置自动保存到 localStorage，刷新不丢失
- **PWA 支持** — 可安装为桌面应用，支持离线使用
- **单文件版本** — 构建为单个 HTML 文件，无需服务器即可双击运行

## 技术栈

- React 19 + TypeScript
- Vite 7
- [docx](https://github.com/dolanmedia/docx) — DOCX 文件生成
- [mammoth](https://github.com/mwilliamson/mammoth.js) — .docx 文件纯文本提取
- [file-saver](https://github.com/nickeahman/FileSaver.js) — 浏览器端文件下载
- GitHub Actions — 自动构建部署到 GitHub Pages & 发布离线版到 Releases

## 本地开发

```bash
npm install
npm run dev
```

默认会启动一个本地开发服务，终端会输出访问地址，例如：

```text
http://127.0.0.1:4173/
```

## Windows 使用

### 直接使用离线版

如果只是使用，不需要开发环境，推荐直接下载离线单文件版本：

1. 打开 [Releases](https://github.com/hehecat/gongwen/releases/latest)
2. 下载 `gongwen.html`
3. 在 Windows 中双击打开即可使用

### 在 Windows 本地运行源码

建议环境：

- `Git for Windows`
- `Node.js 20+`
- `npm 10+`

步骤：

```bash
git clone <你的仓库地址>
cd gongwen
npm install
npm run dev
```

如需导出离线可分发版本：

```bash
npm run build:single
```

生成文件位置：

```text
dist/index.html
```

## 这份增强版已做的规则补充

### 1. 标题写法规范化

以下写法会自动纠正：

- `1、总体要求` -> `一、总体要求`
- `(一)指导思想` -> `（一）指导思想`
- `一）指导思想` -> `（一）指导思想`
- `1．加强组织领导` -> `1.加强组织领导`
- `(2)明确责任分工` -> `（2）明确责任分工`

### 2. 标题层级统一

当同一节内部出现混写时，系统会按上下文自动统一层级：

- 一级标题下的并列子项统一为二级标题 `（一）`
- 二级标题下的并列子项统一为三级标题 `1.`
- 三级标题下的并列子项统一为四级标题 `（1）`

### 3. 附件规则

- 附件说明放在正文下空一行
- 自动清理附件名称末尾标点
- 多附件按 `1.` `2.` `3.` 形式处理

### 4. 落款规则

- 支持识别基层单位名称，如“街道”“社区”“居委会”等
- 无印章场景下，署名前空一行
- 署名与成文日期在预览分页时保持同页，不拆页

## 注意事项

- 当前导入 `.docx` 时仍采用纯文本提取后重排的方式，不保留原 Word 的复杂富文本结构
- 因此表格、图片、批注、修订、页眉页脚等复杂内容，不属于当前版本的强项
- 当前更适合“正文类公文整理、洗稿、规范化导出”

## 构建

```bash
npm run build          # 标准构建（含 PWA），产物输出到 dist/
npm run build:single   # 单文件离线构建，生成 dist/index.html（约 1MB）
npm run preview        # 本地预览构建产物
```

## 项目结构

```
src/
├── components/
│   ├── Editor/          # 文本编辑器（支持拖拽上传）
│   ├── Preview/         # A4 分页预览 (A4Page + Preview)
│   ├── SettingsModal/   # 格式配置弹窗（含版头/版记设置）
│   └── Toolbar/         # 顶部工具栏（导入/导出）
├── contexts/            # DocumentConfig 全局状态
├── exporter/            # DOCX 导出 (docxBuilder + styleFactory)
├── hooks/               # useDocumentParser / usePagination
├── parser/              # 公文文本 → AST 解析器
├── types/               # AST 节点类型 / 文档配置类型
├── utils/               # 文件导入 / 标点净化
└── constants/           # GB/T 9704 排版常量
```

## License

MIT
