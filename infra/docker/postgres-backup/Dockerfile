# PostgreSQL 16 + TimescaleDB 2.18.2; digest from the existing verified runtime.
FROM timescale/timescaledb:2.18.2-pg16@sha256:83bf45d0384a17644c49fdc68bde3e1f19e190fc259fe4f81fd41459d4e0f8be AS build
ARG PGBACKREST_VERSION=2.59.2
ARG PGBACKREST_SHA256=dbdc5edb5161c57bd3ae61e416b1cd763205ad6ce41d9356114432a0cc0ce577
RUN apk add --no-cache build-base meson ninja pkgconf openssl-dev libxml2-dev lz4-dev zstd-dev bzip2-dev zlib-dev postgresql16-dev curl \
 && curl --fail --location --retry 3 "https://github.com/pgbackrest/pgbackrest/releases/download/release/${PGBACKREST_VERSION}/pgbackrest-${PGBACKREST_VERSION}.tar.gz" -o /tmp/source.tar.gz \
 && echo "${PGBACKREST_SHA256}  /tmp/source.tar.gz" | sha256sum -c - \
 && mkdir /build && tar -xzf /tmp/source.tar.gz -C /build \
 && meson setup /build/out "/build/pgbackrest-${PGBACKREST_VERSION}" -Dlibssh2=disabled -Dlibsystemd=disabled \
 && ninja -C /build/out && meson test -C /build/out --suite smoke
FROM timescale/timescaledb:2.18.2-pg16@sha256:83bf45d0384a17644c49fdc68bde3e1f19e190fc259fe4f81fd41459d4e0f8be
RUN apk add --no-cache bash python3 libxml2 lz4-libs zstd-libs libbz2 libpq openssl ca-certificates \
 && mkdir -p /etc/pgbackrest /var/lib/solar-backup /var/log/pgbackrest
COPY --from=build /build/out/src/pgbackrest /usr/local/bin/pgbackrest
COPY infra/docker/postgres-backup/ /opt/solar-backup/
RUN chmod +x /opt/solar-backup/*.sh \
 && for script in /opt/solar-backup/*.sh; do bash -n "$script" || exit; done \
 && pgbackrest version
ENTRYPOINT ["/opt/solar-backup/entrypoint.sh"]
CMD ["postgres"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 CMD /opt/solar-backup/entrypoint.sh health
