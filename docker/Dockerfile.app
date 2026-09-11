# Builds the application jars (VoltSP pipeline + stored procedures + loadgen + query bench).
#
# IMPORTANT: the build depends on Volt Active Data artifacts (org.voltdb:voltdb,
# voltdbclient, volt-stream-*) that are NOT on Maven Central — they ship inside the
# licensed VoltDB / VoltSP kits. Make them resolvable in ONE of two ways:
#
#   (A) Mount a pre-populated local Maven cache that already has them, e.g.
#         docker build -f docker/Dockerfile.app -t novapay-app \
#           --build-context m2=$HOME/.m2 ..            # then COPY --from=m2 ...
#       (simplest: build the jar on the host with `mvn -q -DskipTests package`
#        and skip this image entirely — the compose file can mount ../target).
#
#   (B) Add `mvn install:install-file` steps here for each kit jar before `mvn package`.
#
# See docs/DEPLOYMENT.md ("Docker") for the full explanation.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
# Expects the Volt artifacts to be resolvable (see note above).
RUN mvn -q -DskipTests package || \
    (echo ">> Build failed — the org.voltdb.* dependencies are almost certainly missing." && \
     echo ">> Install them from your licensed kits into the Maven cache first (see docs/DEPLOYMENT.md)." && false)

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/*-all.jar /app/app.jar
# Default: run the load generator. Override `command:` in compose for other entrypoints.
ENTRYPOINT ["java", "-cp", "/app/app.jar"]
CMD ["com.novapay.poc.loadgen.TxnLoadGenerator", "2000", "10000000", "kafka:9092", "novapay-txn-events"]
