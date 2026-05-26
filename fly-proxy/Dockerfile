FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum main.go ./
RUN CGO_ENABLED=0 go build -o probe-proxy .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates curl

# Download MaxMind GeoLite2 databases at build time
ARG MAXMIND_LICENSE_KEY
RUN if [ -n "$MAXMIND_LICENSE_KEY" ]; then \
      curl -sSL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz" \
      | tar -xzf - -C /tmp && \
      find /tmp -name 'GeoLite2-City.mmdb' -exec mv {} /GeoLite2-City.mmdb \; && \
      rm -rf /tmp/GeoLite2-* && \
      curl -sSL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz" \
      | tar -xzf - -C /tmp && \
      find /tmp -name 'GeoLite2-ASN.mmdb' -exec mv {} /GeoLite2-ASN.mmdb \; && \
      rm -rf /tmp/GeoLite2-* ; \
    fi

COPY --from=build /app/probe-proxy /probe-proxy
EXPOSE 8080
CMD ["/probe-proxy"]
