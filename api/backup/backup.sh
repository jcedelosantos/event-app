#!/bin/sh
set -eu

TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
FILE="backup-${TIMESTAMP}.dump"

pg_dump "$DATABASE_URL" --format=custom --no-owner --file="/tmp/${FILE}"
aws s3 cp "/tmp/${FILE}" "s3://${BACKUP_BUCKET}/postgres/${FILE}" --endpoint-url "${BACKUP_ENDPOINT}"
rm -f "/tmp/${FILE}"

echo "Backup subido: ${FILE}"
