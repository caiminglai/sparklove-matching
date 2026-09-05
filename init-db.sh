#!/bin/bash
# 仅在 PG 数据卷首次初始化时由 postgres 容器自动执行一次
# 作用：把 match_db.dump（PG18 自定义格式）导入到 match_db 库
set -e

DUMP=/docker-entrypoint-initdb.d/match_db.dump

if [ -f "$DUMP" ]; then
  echo "[init-db] 检测到 dump，开始导入到数据库 $POSTGRES_DB ..."
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --no-owner --no-privileges "$DUMP" \
    || echo "[init-db] pg_restore 报告了可忽略的警告，继续启动"
  echo "[init-db] 数据导入完成"
else
  echo "[init-db] 未找到 dump 文件，跳过导入（将启动为空库）"
fi
