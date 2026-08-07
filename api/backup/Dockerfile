FROM postgres:18-alpine

RUN apk add --no-cache aws-cli bash

WORKDIR /app
COPY backup.sh ./backup.sh
RUN chmod +x ./backup.sh

CMD ["./backup.sh"]
