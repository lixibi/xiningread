# GitHub Actions 自动构建 Docker 镜像指南

本项目已配置 GitHub Actions 工作流，可以自动构建和发布 Docker 镜像到 GitHub Container Registry (GHCR)。

## 工作流触发条件

工作流在以下情况下会被触发：

- 推送代码到 `main` 或 `master` 分支
- 推送版本标签（格式为 `v*.*.*`，例如 `v1.0.0`）
- 创建针对 `main` 或 `master` 分支的 Pull Request

## 镜像标签策略

工作流会自动为构建的镜像生成以下标签：

- 分支名称（例如：`main`）
- Pull Request 编号（例如：`pr-42`）
- 语义化版本号（当推送标签时）：
  - 完整版本号（例如：`v1.2.3`）
  - 主次版本号（例如：`1.2`）
  - 主版本号（例如：`1`）
- 提交 SHA（短格式）

## 如何使用

### 发布新版本

要发布新版本的镜像，只需创建并推送一个新的标签：

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 拉取镜像

发布后，可以使用以下命令拉取镜像：

```bash
docker pull ghcr.io/用户名/仓库名:标签
```

例如：

```bash
docker pull ghcr.io/用户名/xiningread:v1.0.0
```

## 权限设置

首次设置时，需要确保：

1. 仓库设置中已启用 GitHub Actions
2. 已授予 GitHub Actions 写入包的权限（在仓库的 Settings > Actions > General 中设置）

## 自定义配置

如需自定义构建过程，可以编辑 `.github/workflows/docker-build.yml` 文件。 