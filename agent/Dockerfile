FROM eclipse-temurin:17-jdk-jammy

WORKDIR /data

RUN apt-get update \
 && apt-get install -y curl ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/*

COPY start.sh /start.sh

# Windows CRLF -> Linux LF + права
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

ENV MC_VERSION=1.20.4
ENV RAM=2G

EXPOSE 25565/tcp

CMD ["/bin/bash", "/start.sh"]
