# SeqForge 换电脑演示与接续开发

更新：2026 年 11 月 1 日。本文用于本地开发和独立演示环境；AWS 发布另见[线上与域名交接](deploy/aws/HANDOFF_ZH.md)。

当前完整前台、客户下单、管理员后台和 API 在同一个 Next.js 应用内，数据库使用 PostgreSQL。GitHub 同步源码、依赖锁定文件和数据库迁移；不会同步本机账号、订单、结果文件、`.env`、浏览器草稿或登录状态。把代码拉到另一台电脑不等于完成网站部署。

**只向老板或同事演示时，可以直接打开 [https://seqforgebio.com](https://seqforgebio.com)，不必安装本地服务，也不依赖开发电脑开机。** 网站运行在 AWS；`www` 会跳转到这个主入口。GitHub push 目前不会自动发布网站。

本地与云端使用独立数据库：本机已有账号、管理员权限、历史订单和客户专属价格不会自动出现在云端，反之亦然。云端指定管理员已完成真实注册、邮箱验证和授权升级；不要在新电脑复制或重建这个账号来“同步权限”。旧的 `seqforge.com` 和公司邮箱仍保持原样。

## 新 Windows 电脑：首次运行

### 1. 安装运行环境

安装 Git for Windows、Node.js 22（至少 22.13）和 PostgreSQL。已有 PostgreSQL 服务可复用，但请为此次演示新建独立数据库。仓库不包含这些安装程序；首次安装依赖需要联网。

重新打开 PowerShell，检查：

```powershell
git --version
node --version
npm.cmd --version
```

Node.js 22.23.4 和 PostgreSQL 18.6 已在 AWS 环境验证；依赖版本以当前锁定文件为准。`.nvmrc` 不会自动在 Windows 安装 Node。本文使用 `npm.cmd`，无需修改系统 PowerShell 执行策略。

### 2. 下载源码

```powershell
git clone https://github.com/Wendelllllll/seqforge-order-system-v2.git
cd seqforge-order-system-v2
npm.cmd ci
npm.cmd run setup
```

若 GitHub 要求登录，使用有仓库访问权限的账号。第一次 `setup` 会生成 `.env` 和随机认证密钥，然后提示先配置数据库并停止，这是预期行为。它不会安装 PostgreSQL，也不会创建数据库或自动建立演示账号。

### 3. 建立独立演示数据库并配置 `.env`

在 PostgreSQL 的 pgAdmin 中连接本机服务器，打开 `postgres` 数据库的 Query Tool。以下 SQL 仅用于首次建立新的演示环境；先将示例密码改为自己的长随机密码。不要连接公司的工作数据库执行。

```sql
CREATE ROLE seqforge_demo WITH LOGIN PASSWORD 'replace-with-your-own-random-password';
CREATE DATABASE seqforge_demo OWNER seqforge_demo;
```

分别执行这两句，并保持自动提交；`CREATE DATABASE` 不能在事务块内执行。名称已经存在时，先核实它的用途，不要删除或覆盖已有数据库。

打开项目里的 `.env`，只配置需要的值；保留 `setup` 已生成的 `BETTER_AUTH_SECRET`：

```dotenv
DATABASE_URL="postgresql://seqforge_demo:YOUR_PASSWORD@localhost:5432/seqforge_demo?schema=public"
BETTER_AUTH_URL="http://localhost:3000"
SHOW_DEMO_ACCOUNTS="false"
RESULT_STORAGE_PATH="storage/results"
```

`YOUR_PASSWORD` 必须换为刚设置的数据库密码。密码中的 `@`、`:`、`/`、`#`、`%` 等字符需要进行 URL 编码；也可为这个独立演示数据库生成只含随机字母和数字的长密码。若 PostgreSQL 使用其他端口，同步修改 `5432`。不要把 `.env` 上传 GitHub 或发送到公开聊天中。

### 4. 初始化本地应用并启动

确认 `.env` 指向刚创建的独立 `seqforge_demo` 数据库，再运行：

```powershell
npm.cmd run setup
npm.cmd run dev -- --hostname localhost --port 3000
```

打开 [http://localhost:3000](http://localhost:3000)，保持终端运行。默认初始化不会创建演示账号；公开页面和业务选项可以先在未登录状态查看。需要研究验证页面时，先按[邮件说明](EMAIL_NOTIFICATIONS.md)配置本地 preview 模式，不要为了设计测试改用云端真实客户数据。

可选的 `--seed-demo` 机制仅适用于明确可丢弃的独立本地数据库。它不会迁移原电脑数据，不能在已有真实账号、订单的工作库或 AWS 库运行。文档不记录账户口令；不要把演示凭据用于真实账号。合成下单测试优先使用 `npm.cmd run test:smoke` 的隔离环境。

以后启动这台已经配置好的 Windows 电脑，可以双击 `Start-SeqForge.cmd`。它会启动网站并打开浏览器；标准安装的 PostgreSQL 服务需要已经运行。原工作电脑若存在 `%LOCALAPPDATA%\SeqForge` 下的便携数据库，启动器会按原方式启动它。启动器不会自动安装依赖、迁移数据库、重建账号或清空数据。

## 已有电脑：拉取更新

1. 先检查 `git status`，保留本地未提交修改；不要用强制重置覆盖自己的工作。
2. 停止网站。通过终端启动的服务按 `Ctrl+C`；通过启动器在后台运行的服务，可先重启电脑，在重新启动网站前完成更新。
3. 升级迁移前备份当前 PostgreSQL 数据库及实际的 `RESULT_STORAGE_PATH`，保留 `.env`。可以使用 pgAdmin 的 Backup 功能导出数据库；不要直接复制正在运行的 PostgreSQL 数据目录充当备份。
4. 在项目目录运行：

```powershell
git pull --ff-only
npm.cmd ci
npm.cmd run setup
npm.cmd run dev -- --hostname localhost --port 3000
```

`setup` 使用 `prisma migrate deploy` 应用仓库已提交的迁移，默认不会创建测试账号。不要添加 `--seed-demo`，也不要运行 `migrate reset`。如果拉取提示分叉、迁移失败或要求重置，先保留数据并检查报错，不能把清空数据库当成升级方法。

依赖安装、构建与数据库迁移需要在演示前完成。建议出发前在目标电脑启动一次；首次访问页面需要开发编译时间。

## 演示和测试边界

- 本工作电脑的 `localhost:3000` 与数据库有需要保留的账号和订单。不要在这里提交合成测试订单，也不要重建此前清理掉的测试账号。
- 手工演示提交只能使用上面新建的独立演示数据库；不要把 `.env` 指向真实工作数据库。
- 自动验证使用下面命令。数据库测试需要当前数据库用户拥有创建隔离 schema 的权限；测试结束后移除测试数据，不向工作订单队列提交：

```powershell
npm.cmd run verify
npm.cmd run test:db
npm.cmd run test:smoke
```

`test:smoke` 会启动独立端口、PostgreSQL schema 和结果目录。不要直接绕过它调用 `scripts/smoke-ordering.ts`。

演示可依次查看公开网站、三项业务选择、Sanger/Whole Plasmid/Oligo 填表与列对应导入、草稿恢复、Dropbox 地图，以及管理员订单、客户、价格和结果页面。Sanger 仅有 Standard/Pre-mixed；标准 Oligo 已按 $0.25/base 计算，其他规格另报价，但完整报价批准和生产流程尚未实现。密码找回、异常订单和完成后的结果通知已有代码，实际邮件/结果闭环仍需验收。需要提交合成订单时继续使用隔离环境。

## 数据转移与常见问题

| 问题 | 处理 |
| --- | --- |
| `node` 或 `npm` 找不到 | 安装 Node.js 22 后重新打开终端；PowerShell 用 `npm.cmd` |
| 数据库连接失败 | 启动 PostgreSQL 服务，检查 `.env` 的服务器、端口、数据库、用户和密码 |
| Prisma Client 或数据库表缺失 | 运行 `npm.cmd ci`，再运行 `npm.cmd run setup` |
| 登录来源不匹配 | 使用 `http://localhost:3000`，与 `BETTER_AUTH_URL` 保持一致 |
| 3000 端口被占用 | 确认是不是已启动的 SeqForge，不要盲目停止其他程序或改端口 |
| 新电脑账号、订单为空 | 正常；GitHub 不包含原电脑数据库，可用独立演示账号演示 |
| 草稿没有跟过来 | 草稿保存在原浏览器；不会通过 GitHub 自动同步 |
| 结果下载失败 | 数据库只有文件记录，实际结果必须在该电脑配置的 `RESULT_STORAGE_PATH` 中 |
| 启动器失败 | 查看 `%LOCALAPPDATA%\SeqForge\website-error.log`，或在终端直接执行启动命令看报错 |

确实需要把真实账号、历史订单或结果带到另一台电脑时，另行通过安全方式迁移 PostgreSQL 备份、结果文件及必要配置；先备份接收电脑原有数据。这不是 `git pull` 的一部分，不能将数据库、密钥、客户文件或个人合同放进仓库。

后续开发先读 `AGENTS.md`、`README.md` 和实际源码；Next.js 的版本文档在 `node_modules/next/dist/docs/`。同一功能尽量在一台电脑完成并提交，换电脑前先推送，另一台电脑先拉取；不要强制推送覆盖别的修改。

## 修改怎样进入线上网站

设计伙伴在本地修改、检查并提交到 GitHub后，线上网站不会立即改变。维护人员需要选择明确的源码版本，在 AWS 构建新的 Linux 镜像，备份并显式应用需要的迁移，再替换运行容器、检查 HTTPS 与健康状态。不要把 Windows 的 `node_modules`、`.next`、本地 `.env` 或数据库复制到服务器，也不要在 AWS 执行上面的本地 setup/demo 步骤。完整流程见[中文 AWS/GoDaddy 交接](deploy/aws/HANDOFF_ZH.md)和[英文运维手册](deploy/aws/README.md)。
