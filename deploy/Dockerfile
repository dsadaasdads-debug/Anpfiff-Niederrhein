# Anpfiff Niederrhein – ein Container, der die App ausliefert und die Daten holt.
#
# Das Projekt kommt ohne Fremdbibliotheken aus, deshalb kein npm install.
FROM node:20-alpine

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Europe/Berlin /etc/localtime && \
    echo "Europe/Berlin" > /etc/timezone

WORKDIR /app
COPY . /app

ENV NODE_ENV=production TZ=Europe/Berlin
EXPOSE 8080

# Startet den Dateiserver und taktet Meldungen, Tabellen und Spieltag.
CMD ["node", "scripts/dienst.mjs"]
