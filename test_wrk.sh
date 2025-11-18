URL="http://localhost"
THREADS=2
CONNECTIONS=50
DURATION=15s

echo "==== wrk load test ===="
wrk -t$THREADS -c$CONNECTIONS -d$DURATION $URL