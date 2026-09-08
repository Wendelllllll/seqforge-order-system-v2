# SeqForge Order System V2：PC 接续开发交接说明

## 2026-09-07：客户下单功能更新

新增服务优先级、Tube/Plate、Standard/Pre-mixed/Ready to load、实体样本与多个测序反应的独立记录、通用/自带/存储/合成引物信息、CSV/TSV/粘贴导入、提交前复核和可打印样本清单。完整说明见 [CUSTOMER_INTAKE.md](CUSTOMER_INTAKE.md)。

拉取后运行 npm ci、npm run setup、npm run verify，再运行 npm run dev。数据库升级为增量迁移，保留旧订单及结果关联；每台电脑的数据仍然独立。建议 Node.js 22.23.2，自动化测试最低需要 22.13。

本轮仍为本地 Demo。分享给客户前需部署独立测试站点，并由实验室确认服务、引物、浓度、板孔和交付规则。旧文档中关于「每条 Sample 就是一个反应」或「尚无板导入」的描述以本次更新为准。

更新时间：2026 年 9 月 7 日。

这份文档帮助你从 GitHub 下载完整的项目源码，在 Windows PC 上启动本地 Demo，并从当前进度继续开发。项目已经完成 Sanger 订单的核心流程：客户注册／登录、提交多样本订单、管理员处理订单并上传结果、客户查看状态并下载结果。

GitHub 保存的是源码、依赖版本锁定文件、数据库结构与迁移、演示账号初始化逻辑和说明文档。每台电脑拥有自己的本地数据库、结果文件和登录密钥。因此，PC 首次运行时会建立自己的演示环境；Mac 上此前创建的订单不会自动出现。

## 1. PC 首次启动

### 准备环境

安装 Git for Windows 和 Node.js 22 的最新补丁版本（至少 22.13），并在安装完成后重新打开终端。项目的 `.nvmrc` 指定主版本为 `22`；这个文件本身不会在 Windows 自动安装或切换 Node。

可以使用 PowerShell、Windows Terminal 或 VS Code 内置终端。先检查：

```powershell
git --version
node --version
npm --version
```

`node --version` 应显示 `v22.x.x`。如果 PowerShell 提示 `npm.ps1` 无法运行，可以把本文的 `npm` 命令写为 `npm.cmd`，或者改用命令提示符。无需为此修改整台电脑的脚本执行策略。

### 下载仓库

本项目的私有仓库位于 [Wendelllllll/seqforge-order-system-v2](https://github.com/Wendelllllll/seqforge-order-system-v2)。在终端执行：

```powershell
git clone https://github.com/Wendelllllll/seqforge-order-system-v2.git
cd seqforge-order-system-v2
```

如果仓库为私有仓库，需要在 PC 上登录有访问权限的 GitHub 账号。Git for Windows 的凭据管理器通常会引导浏览器登录；也可以使用 GitHub Desktop 克隆后，在项目目录打开终端。

### 安装并初始化

在包含 `package.json` 的项目根目录执行：

```powershell
npm ci
npm run setup
npm run dev
```

这三步的作用分别是：

1. `npm ci`：根据 `package-lock.json` 安装精确锁定的依赖。第一次需要网络，用来下载依赖和相关平台组件。
2. `npm run setup`：在缺少 `.env` 时生成本地配置及随机认证密钥；在缺少 SQLite 数据库时创建数据库；生成 Prisma Client；应用已提交的数据库迁移；建立演示账号。
3. `npm run dev`：启动本地 Next.js 开发服务器。

初始化用于准备本机环境，不是“清空数据重新开始”的命令。已有本地配置和数据库应予以保留；种子逻辑检查账号是否存在，再补齐演示账号。

浏览器打开 [http://localhost:3000](http://localhost:3000)。终端需要保持运行；关闭开发服务器可在该终端按 `Ctrl+C`。

目前认证配置明确使用 `http://localhost:3000`。如果 3000 端口被其他程序占用，应先确认并停止占用该端口的本地服务，然后重新启动项目。切换到其他端口、使用 `127.0.0.1` 或局域网 IP，需要同步检查 `.env` 和 `src/lib/auth.ts` 的认证 URL／可信来源配置。

### 登录演示账号

| 角色 | 邮箱 | 密码 | 登录后的主要入口 |
| --- | --- | --- | --- |
| 客户 | `scientist@demo.local` | `DemoCustomer!2026` | `/dashboard` |
| 管理员 | `admin@seqforge.local` | `SeqForgeDemo!2026` | `/admin` |

这些账号用于本地演示。第一次初始化会创建它们，但不会导入 Mac 上已有的订单，也不会自动建立演示订单。

如果同名账号已经存在，当前种子程序不会重置其密码；因此，若以后为该账号修改了密码，重复运行初始化也不会把密码改回表中的值。

## 2. 在 PC 上确认完整流程可用

建议先做一次下面的操作，再开始修改功能：

1. 用客户账号登录，进入新建订单页面。
2. 输入订单名称，例如 `PC handoff test`，添加两个样本，填写样本名称与引物名称，然后提交。
3. 确认页面出现订单编号，订单列表也能找到该订单。刷新页面后记录仍应存在。
4. 退出客户账号，用管理员账号登录，打开刚才的订单。
5. 将状态改为 `Received` 或 `Processing`，确认状态历史新增一条记录。
6. 上传项目根目录中的 `demo-result.txt`。这是专门用于演示的合成结果文件。
7. 重新登录客户账号，打开订单，确认状态为 `Completed`，并下载刚上传的文件。
8. 可另外注册一个客户账号，确认其订单列表不会显示第一个客户的订单。

客户和管理员可以分别使用普通窗口与无痕窗口，减少反复退出和登录。

当前源码限制单个上传文件不超过 25 MB，一张订单关联一份当前结果文件；再次上传会更新该订单的结果记录。

9 月 7 日还在不含原数据库和密钥的干净副本中验证了依赖安装、数据库初始化、重复初始化、两个演示账号登录和角色检查，以及 lint、类型检查和生产构建；初始化与代码验证使用 macOS 上的 Node.js 22.23.2。9 月 4 日的完整浏览器演示记录见进度文档。**Windows 的浏览器流程仍需在目标 PC 实机确认。**

## 3. 项目用什么建立

项目采用同一个 Next.js 应用提供页面和服务器接口，使用 SQLite 在本机保存业务数据。无需单独安装 MySQL、PostgreSQL 或独立后端服务。

```text
浏览器：客户页面 / 管理员页面
                  │
                  ▼
Next.js：页面渲染、服务器接口、权限检查
        │                    │
        ▼                    ▼
Better Auth               Prisma
注册、登录、会话              │
        └────────────────────┤
                             ▼
                       SQLite 数据库
                       prisma/dev.db

结果文件上传 → storage/results/ → 权限检查后提供下载
```

| 工具 | 当前项目中的用途 |
| --- | --- |
| Node.js 22 | 运行应用、构建过程和初始化脚本 |
| npm / `package-lock.json` | 安装并锁定依赖版本 |
| Next.js 16.3.4 | App Router 页面、服务器渲染、API 路由 |
| React 19.2.8 | 客户端表单与页面组件 |
| TypeScript | 静态类型检查 |
| Tailwind CSS 4 | 页面样式和响应式布局 |
| Better Auth 1.7 系列 | 邮箱密码注册／登录及会话管理 |
| Prisma 6.19 系列 | 数据模型、数据库迁移和数据库访问 |
| SQLite | 将本地数据保存在一个数据库文件中 |
| Zod | 服务器端校验订单和状态变更输入 |
| Lucide React | 界面图标 |
| ESLint | 代码检查 |
| Git / GitHub | 源码版本记录与多设备开发交接 |

依赖的精确安装版本以 `package-lock.json` 为准。当前 `dev` 与 `build` 命令显式使用 Webpack。

## 4. 文件地图：接着开发时先看哪里

| 文件或目录 | 内容与阅读目的 |
| --- | --- |
| `README.md` | 项目简介、常用命令与启动方式 |
| `PROJECT_PROGRESS.md` | 当前里程碑、已完成项目与后续事项 |
| `SEQFORGE_DEMO_TECHNICAL_AND_SALES_GUIDE_ZH.md` | 详细技术原理、产品说明与销售演示讲解 |
| `PC_HANDOFF_ZH.md` | 本文：PC 安装、多设备同步与接续开发说明 |
| `AGENTS.md` | 在本项目中协作的开发约定，尤其是 Next.js 版本注意事项 |
| `package.json` / `package-lock.json` | 项目命令与依赖 |
| `.env.example` | 可提交到 Git 的配置示例，不包含本机真实密钥 |
| `prisma/schema.prisma` | 用户、认证、订单、样本、结果和状态历史的数据模型 |
| `prisma/migrations/` | 可重复应用到新数据库的结构迁移 |
| `prisma/seed.ts` | 演示账号初始化 |
| `prisma.config.ts` | Prisma 配置及数据库连接配置读取 |
| `src/app/login/` / `src/app/register/` | 登录与注册入口 |
| `src/app/(customer)/` | 客户仪表盘、订单列表、订单详情、新建订单和账号页面 |
| `src/app/(admin)/` | 管理员订单队列、订单详情及管理员布局 |
| `src/app/api/` | 认证、下单、状态更新、上传与下载服务器接口 |
| `src/components/order-form.tsx` | 多样本订单表单，后续改进批量输入的主要入口 |
| `src/components/admin-order-actions.tsx` | 管理员状态修改与结果上传界面 |
| `src/components/auth-form.tsx` | 登录和注册表单 |
| `src/components/portal-shell.tsx` | 门户导航及页面外框 |
| `src/lib/auth.ts` / `auth-client.ts` | 服务器与浏览器侧认证配置 |
| `src/lib/session.ts` | 页面会话读取与客户／管理员权限判断 |
| `src/lib/prisma.ts` | Prisma 数据库客户端 |
| `src/lib/orders.ts` | 订单状态、样本类型、引物来源、日期显示等共享定义 |
| `src/app/globals.css` | 全局样式 |
| `storage/results/` | 仅存在于本机的上传文件；Git 只保存目录占位文件 |
| `demo-result.txt` | 可提交、可重复使用的合成演示结果文件 |

路由目录名中的 `(customer)` 和 `(admin)` 用于代码分组与布局，不会成为浏览器 URL 的一部分。例如客户仪表盘地址为 `/dashboard`。

开始修改 Next.js 相关代码前，遵循 `AGENTS.md`，先读已安装依赖中的相关说明：`node_modules/next/dist/docs/`。本项目使用的 Next.js 版本包含新约定，不能直接套用旧版本示例。

## 5. 当前数据库结构

| 数据表 | 存什么 | 主要关系 |
| --- | --- | --- |
| `User` | 姓名、邮箱、角色、机构名、实验室名、电话 | 一个用户可有多个订单、会话和认证账号 |
| `Session` | 会话令牌、过期时间、用户关联 | 属于一个用户 |
| `Account` | Better Auth 认证账号及密码哈希等 | 属于一个用户 |
| `Verification` | 认证库使用的验证记录 | 表结构已提供；不代表已接通邮箱验证流程 |
| `Order` | 订单编号、客户、服务、状态、PO 和备注 | 属于一个客户；关联多个样本、多个状态历史及最多一个当前结果 |
| `Sample` | 样本顺序、名称、模板类型、浓度、引物、备注 | 属于一张订单 |
| `Result` | 原文件名、存储文件名、类型、大小和上传时间 | 一张订单最多一条当前结果记录；文件内容保存在本地磁盘 |
| `StatusHistory` | 订单状态及记录时间 | 属于一张订单 |

机构名称与实验室名称目前是 `User` 的字符串字段，还没有独立的 Organization、Lab、Membership 数据表，也没有机构成员共享订单的权限模型。

当前订单状态定义为：

```text
SUBMITTED → RECEIVED → PROCESSING → SEQUENCED → QC → COMPLETED
```

界面提供这些状态，接口也会验证状态名称是否有效。但目前管理员可以直接选择有效状态；尚未建立必须逐步前进的严格状态转换规则。

订单编号采用 `SF-YYMM####` 形式，根据 UTC 年月加本月序号生成。低并发本地演示已经可用；面向多人同时提交时，应改进序号分配、冲突重试及序号容量边界。

## 6. 已完成什么，还要完成什么

已经具备可演示的业务流程：

- 客户注册／登录与客户、管理员角色区分。
- 客户仪表盘、订单历史、订单详情。
- Sanger 多样本下单，服务器校验输入并保存订单、样本与初始状态记录。
- 管理员队列、订单检查、状态修改与历史记录。
- 客户查看更新后的订单状态。
- 管理员上传本地结果文件，客户经权限检查后下载。
- 数据库结构迁移和可重复建立的演示账号。
- 中文技术与销售学习资料。

此前验证记录见 `PROJECT_PROGRESS.md`。它记录了检查与测试已经发生的时间点；PC 后续修改后的状态仍需重新验证，不能把历史通过记录当作所有后续版本的保证。

建议按以下顺序接续；这些是下一阶段工作建议，不代表已经实现，也不是已确定的交付日期。

| 优先级 | 接着做的工作 | 完成时应看到什么 |
| --- | --- | --- |
| P0 | 在 PC 完成首次启动与完整演示流程 | PC 上可以从新订单走到结果下载，重启后订单仍存在 |
| P1 | 改进大量样本输入 | 减少逐个输入样本的重复操作；根据实际需要选择表格粘贴、批量复制或导入，并覆盖输入校验 |
| P1 | 增加核心自动化测试 | 覆盖客户权限隔离、管理员操作限制、下单、上传下载等关键路径，测试使用独立数据库和合成文件 |
| P1 | 改善错误提示和加载恢复 | 网络失败、无效输入、上传失败时提示清楚，表单可恢复，不会一直停留在加载状态 |
| P1 | 加固订单编号与状态逻辑 | 并发创建不会因相同编号而失败；明确允许的状态转换及状态回退规则 |
| P1 | 完善文件一致性与结果替换 | 上传数据库写入失败时能处理新文件；替换结果时处理旧文件，避免残留文件持续增长 |
| P2 | 增加正式机构／实验室成员模型 | 依据确认后的业务规则实现成员、负责人和共享订单权限 |
| P2 | 账号与通知流程 | 根据需求补充邮箱验证、密码重置及订单通知 |
| P2 | 从本地 Demo 转为生产服务 | 选定托管环境、服务器数据库、文件存储、备份恢复、监控与部署流程，并完成上线前测试 |
| 待业务确认 | 其他原始需求 | 定价、支付、旧数据迁移、板式输入、其他服务类型、ABI／LIMS 等按范围逐项设计 |

当前状态历史没有保存“谁操作的”和“操作理由”，结果只保存一份当前记录，也没有完整的结果版本管理。若后续宣传操作审计或历史结果追溯，需要先补齐对应实现。

## 7. GitHub 同步什么，不同步什么

| 内容 | 随 GitHub 同步 | 新电脑如何得到 |
| --- | --- | --- |
| 页面、接口、业务代码与配置模板 | 是 | `git clone` / `git pull` |
| 数据库结构与迁移 | 是 | 拉取后由初始化或迁移命令应用 |
| 演示账号的创建代码 | 是 | `npm run setup` 初始化 |
| 中文手册、进度、交接说明 | 是 | `git clone` / `git pull` |
| `package-lock.json` | 是 | 拉取后执行 `npm ci` 安装对应版本 |
| `node_modules/` | 否 | 本机执行 `npm ci` 生成 |
| `.next/` 等构建缓存 | 否 | 启动或构建时生成 |
| `.env` 和本机认证密钥 | 否 | 本机初始化产生；需要时在本机自行配置 |
| `prisma/dev.db` 中的订单、客户、会话 | 否 | 本机初始化并通过页面创建演示数据 |
| `storage/results/` 中已上传的结果文件 | 否 | 在本机重新上传演示结果 |

不要把 Mac 的 `node_modules` 拷贝到 Windows；其中可能包含针对操作系统编译或下载的组件。锁定文件使两个环境安装对应版本，但具体平台文件会在安装时重新获得。

如果以后确实需要把 Mac 上的现有演示订单搬到 PC，应安排一次单独的数据迁移，同时复制匹配的数据库与结果文件，并先停止写入、做好备份。仅复制数据库会出现“记录存在，但结果文件缺失”的情况。不要用 Git 合并两个 SQLite 数据库文件。

代码可以通过 GitHub 在两台电脑之间交接；两台电脑要同时看到同一份实时业务数据，则需要共享后端数据库与文件存储，这是后续部署架构的工作。

## 8. 每次换电脑怎样继续

最简单的习惯是：一段功能尽量在一台电脑完成，确认后提交并推送；换电脑后先拉取，再接着修改。

### 开始工作前

```powershell
git status
git branch --show-current
git pull --ff-only
```

先确认当前分支正确、没有自己尚未处理的修改。`git pull --ff-only` 在本地与远端历史已经分叉时会停止，避免自动产生你未理解的合并结果。

如果分叉或存在本地修改，先查看 `git status` 和差异，保存自己的工作，再决定合并或变基。不要通过强制推送或重置来跳过检查。

若拉取内容更新了依赖或迁移，在应用停止时执行：

```powershell
npm ci
npm run setup
npm run dev
```

已有数据库应用结构变更前，先确认迁移内容；如果有需要保留的本地数据，可以在停止应用及数据库工具后备份 `prisma/dev.db` 和 `storage/results/`。

### 完成一段工作后

```powershell
npm run verify
git status
git diff
```

`npm run verify` 运行代码检查、TypeScript 检查和生产构建；它不等于浏览器端到端测试。涉及订单与权限的修改，还应实际操作相关页面或运行后来补充的自动化测试。

确认差异属于本次工作后，把需要同步的文件加入提交。例如只修改了订单表单和进度说明，可以执行：

```powershell
git add src/components/order-form.tsx PROJECT_PROGRESS.md
git diff --cached
git commit -m "Improve sample entry workflow"
git push
```

上面的文件名是示例，应替换为实际修改的文件。提交前查看暂存差异，确认没有把本机数据和密钥带入仓库。

如果创建新功能分支，使用 `codex/` 前缀，例如：

```powershell
git switch -c codex/sample-entry
```

第一次推送该分支时使用：

```powershell
git push -u origin codex/sample-entry
```

换到另一台电脑后需要切换到同一功能分支；只拉取默认分支不会自动得到尚未合并的功能分支代码。通过 GitHub 合并后，再在两台电脑的默认分支拉取更新。

每次交接建议同时更新 `PROJECT_PROGRESS.md`，记录本次完成项、验证结果和下一步。Git 提交记录说明“改了什么”，进度文档说明“现在做到哪里”。

## 9. 修改数据库时怎样协作

首次启动和应用已经存在的迁移，使用：

```powershell
npm run setup
```

需要修改数据模型时，再按以下开发流程处理：

1. 修改 `prisma/schema.prisma`。
2. 在本地开发数据库上执行 `npm run db:migrate -- --name describe_change`，其中名称替换为本次结构变更的简短描述。
3. 检查生成的迁移 SQL，确认不会意外删除需保留的数据。
4. 运行相关业务验证。
5. 将 schema 和新迁移目录一起提交。
6. 另一台电脑拉取后应用迁移。

如果迁移工具要求重置数据库，应先理解原因并确认数据是否可丢弃，不能把“重置”当作普通安装步骤。不要修改已经被另一台电脑应用的历史迁移来掩盖结构差异；后续变更应生成新的迁移。

查看本机数据可以运行：

```powershell
npm run db:studio
```

Prisma Studio 会提供数据库浏览界面。直接编辑认证、角色、关联 ID 等字段会影响应用行为，因此日常演示数据优先通过网站创建。

## 10. 常见启动问题

| 现象 | 先检查什么 |
| --- | --- |
| `git`、`node` 或 `npm` 找不到 | 是否完成安装并重新打开终端；检查 PATH 和版本 |
| PowerShell 阻止 `npm.ps1` | 使用 `npm.cmd` 或命令提示符 |
| 安装依赖失败 | 查看网络、代理和报错；确认使用 Node.js 22，并在项目根目录运行 |
| Prisma Client 找不到或尚未初始化 | 安装依赖后执行 `npm run setup` |
| 提示缺少 `DATABASE_URL` 或认证密钥 | 确认 `.env` 存在且配置完整；不要把 `.env` 内容贴到公开问题中 |
| 登录提示来源／地址不匹配 | 使用 `http://localhost:3000`，检查 `.env` 中的 URL 和认证可信来源 |
| 3000 端口被占用 | 确认是否已有另一个开发服务器，不要直接切到不同端口后忽略认证配置 |
| PC 订单列表是空的 | 首次启动只创建演示账号；Mac 的本地订单没有随 Git 同步 |
| 订单有结果记录但无法下载 | 检查本机 `storage/results/` 是否包含数据库记录指向的文件 |
| Git 拉取失败，提示分叉或冲突 | 先查看本地修改与提交，保留自己的工作后再处理合并 |
| 修改后检查失败 | 查看第一个明确错误，修复后再运行检查，不要只依据服务器能启动判断完成 |

## 11. 可以直接交给 PC 上开发助手的说明

复制下面这段作为下一次开发的起点：

> 请继续开发这个 SeqForge Order System V2 本地 Demo。先阅读 AGENTS.md、README.md、PC_HANDOFF_ZH.md、PROJECT_PROGRESS.md，以及需要修改功能的实际源码。当前使用 Next.js 16.3.4、React、TypeScript、Tailwind CSS、Better Auth、Prisma 和 SQLite。客户注册登录、多样本 Sanger 下单、管理员状态更新、结果上传和客户授权下载已经实现。机构和实验室仍是用户资料字段，还没有机构成员权限模型。先用 Node.js 22 执行 npm ci、npm run setup、npm run dev，在 Windows 上验证完整流程，并记录实际结果。随后优先完善高样本量输入、关键流程测试和错误恢复。遵循本地 Next.js 文档；保留已有修改；不要提交 .env、SQLite 数据库、上传结果或 node_modules。每次完成一个可验证的小功能，更新 PROJECT_PROGRESS.md，完成适当检查，再提交推送。

这个交接起点已经包含源码、可重建的数据结构、演示账号和下一阶段工作。PC 上第一次操作的重点是重建环境并确认流程，其后即可直接继续开发。
