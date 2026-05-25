FROM golang:1.21-alpine AS build
WORKDIR /app
COPY go.mod main.go ./
RUN go mod tidy && CGO_ENABLED=0 go build -o probe-proxy .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates curl

# Download MaxMind GeoLite2-City database at build time
ARG MAXMIND_LICENSE_KEY
RUN if [ -n "$MAXMIND_LICENSE_KEY" ]; then \
      curl -sSL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz" \
      | tar -xzf - --strip-components=1 -C /tmp '*.mmdb' && \
      mv /tmp/GeoLite2-City.mmdb /GeoLite2-City.mmdb; \
    fi

COPY --from=build /app/probe-proxy /probe-proxy
EXPOSE 8080
CMD ["/probe-proxy"]
