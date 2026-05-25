FROM golang:1.21-alpine AS build
WORKDIR /app
COPY go.mod main.go ./
RUN CGO_ENABLED=0 go build -o probe-proxy .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=build /app/probe-proxy /probe-proxy
EXPOSE 8080
CMD ["/probe-proxy"]
