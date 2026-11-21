#!/usr/bin/env bash
# Usage: WOLF_URL=... WOLF_STATUS_TOKEN=... bash scripts/wolf-status-run.sh job-id command [args...]
set -u
umask 077

if (( $# < 2 )); then
    printf 'Usage: wolf-status-run.sh job-id command [args...]\n' >&2
    exit 64
fi
job_id=$1
shift
ready=0
sequence=0
run_id=''
log_file=''

diagnostic() { printf 'wolf-status: %s\n' "$*" >&2; }

send_event() {
    local payload=$1 response http code attempt
    for attempt in 1 2 3; do
        response=$(curl --silent --show-error --connect-timeout 2 --max-time 5 \
            --output /dev/null --write-out '%{http_code}' \
            -X POST "${WOLF_URL%/}/api/status/v1/jobs/${job_id}/events" \
            -H "Authorization: Bearer ${WOLF_STATUS_TOKEN}" \
            -H 'Content-Type: application/json' --data-binary "$payload")
        code=$?
        http=${response:-000}
        if (( code == 0 )) && [[ $http == 200 || $http == 201 ]]; then return 0; fi
        diagnostic "report failed (curl=${code}, HTTP=${http}, attempt=${attempt})"
        if (( code == 0 )) && [[ $http != 429 && $http != 5?? ]]; then return 1; fi
        if (( attempt < 3 )); then sleep "$attempt"; fi
    done
    return 1
}

event_payload() {
    local type=$1 outcome=${2:-} exit_code=${3:-0} event_id
    event_id=$(cat /proc/sys/kernel/random/uuid) || return 1
    jq -cn --arg eventId "$event_id" --arg runId "$run_id" \
        --argjson sequence "$sequence" --arg type "$type" --arg source "$(hostname)" \
        --arg occurredAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg scheduledFor "${WOLF_STATUS_SCHEDULED_FOR:-}" \
        --arg outcome "$outcome" --argjson exitCode "$exit_code" \
        '{eventId:$eventId,runId:$runId,sequence:$sequence,type:$type,source:$source,occurredAt:$occurredAt}
        + (if $scheduledFor == "" then {} else {scheduledFor:$scheduledFor} end)
        + (if $type == "completed" then {outcome:$outcome,exitCode:$exitCode} else {} end)'
}

finish() {
    local exit_code=$? outcome payload log_payload log_id
    trap - EXIT
    if (( ready )); then
        sequence=$((sequence + 1))
        # Opt-in excerpts can contain secrets; full output remains in the protected local log.
        if [[ ${WOLF_STATUS_SEND_LOGS:-0} == 1 ]]; then
            log_id=$(cat /proc/sys/kernel/random/uuid)
            if log_payload=$(tail -c 8192 "$log_file" | jq -Rsc \
                --arg eventId "$log_id" --arg runId "$run_id" --argjson sequence "$sequence" \
                --arg occurredAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                '{eventId:$eventId,runId:$runId,sequence:$sequence,type:"log",occurredAt:$occurredAt,log:.}'); then
                if ! send_event "$log_payload"; then diagnostic 'log event was not delivered'; fi
            else diagnostic 'could not encode log excerpt'; fi
            sequence=$((sequence + 1))
        fi
        outcome=succeeded
        if (( exit_code != 0 )); then outcome=failed; fi
        if payload=$(event_payload completed "$outcome" "$exit_code"); then
            if ! send_event "$payload"; then diagnostic 'completion was not delivered'; fi
        else diagnostic 'could not encode completion'; fi
        diagnostic "full task log: ${log_file}"
    fi
    exit "$exit_code"
}
trap finish EXIT

if [[ -z ${WOLF_URL:-} || -z ${WOLF_STATUS_TOKEN:-} ]]; then
    diagnostic 'WOLF_URL or WOLF_STATUS_TOKEN is unset; running task without reporting'
elif [[ ! $job_id =~ ^[a-z0-9][a-z0-9_-]{0,79}$ ]]; then
    diagnostic 'invalid job ID; running task without reporting'
elif ! command -v curl >/dev/null || ! command -v jq >/dev/null; then
    diagnostic 'curl and jq are required for reporting; running task without reporting'
else
    log_dir=${WOLF_STATUS_LOG_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/wolfdrive-status}
    if run_id=$(cat /proc/sys/kernel/random/uuid) && mkdir -p "$log_dir" && log_file=$(mktemp "${log_dir}/${job_id}.XXXXXXXX.log"); then
        ready=1
        if payload=$(event_payload started); then
            if ! send_event "$payload"; then diagnostic 'start was not delivered; task will still run'; fi
        else diagnostic 'could not encode start'; fi
    else diagnostic 'could not initialize reporting; running task without reporting'; fi
fi

if (( ready )); then
    "$@" > "$log_file" 2>&1
    task_exit=$?
    if ! cat "$log_file"; then diagnostic 'could not display captured output'; fi
    exit "$task_exit"
else
    "$@"
    exit $?
fi
