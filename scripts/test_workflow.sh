#!/bin/bash

PROFILE="hub-account"
STACK_NAME="EvalAppFrameworkStack"

checkStackExists() {
    aws cloudformation describe-stacks --stack-name "$STACK_NAME" --profile "$PROFILE" &> /dev/null
    return $?
}


# Get Step Function ARN from stack outputs
getStepFunctionArn() {
    step_function_arn=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --query "Stacks[0].Outputs[?OutputKey=='StepFunctionArn'].OutputValue" \
        --output text)

    if [ -z "$step_function_arn" ]; then
        echo "Failed to retrieve Step Function ARN from stack outputs."
        exit 1
    fi

    echo "$step_function_arn"
}

# Invoke Step Function
invokeStepFunction() {
    local arn=$1
    echo "Invoking Step Function: $arn"

#New
#9XWGSWO7E2

#Old
#38BKVBCQXT
    # Create JSON input with placeholder values
    input_json=$(cat <<EOF
{
    "runMode" : "benchmark",
    "experiment_param": "kb_id",
    "experiment_description": "Sample experiment 5",
    "application_name": "SampleApp1",
    "kb_id": ["9XWGSWO7E2","38BKVBCQXT"],
    "gen_model_id": "anthropic.claude-3-sonnet-20240229-v1:0",
    "judge_model_id": "anthropic.claude-3-haiku-20240307-v1:0",
    "embed_model_id": "amazon.titan-embed-text-v2:0",
    "max_token": 1000,
    "temperature": [0.2,0.6,0.9],
    "top_p": 0.95,
    "num_retriever_results": 5,
    "custom_tag": "test-run"
}
EOF
)
# Get the current time in year, month, day, hour, minute, second format
current_time=$(date +'%Y%m%d_%H%M%S')

# Extract application_name and experiment_param from input_json
application_name=$(echo "$input_json" | jq -r '.application_name')
runMode=$(echo "$input_json" | jq -r '.runMode')

# Construct the execution_name
execution_name="${application_name}_${runMode}_${current_time}"

    
    invoke_output=$(aws stepfunctions start-execution \
        --name "$execution_name" \
        --state-machine-arn "$arn" \
        --input "$input_json" \
        --profile "$PROFILE" \
        --output json)

    if [ $? -eq 0 ]; then
        execution_arn=$(echo "$invoke_output" | jq -r '.executionArn')
        echo "Step Function execution started. Execution ARN: $execution_arn"
    else
        echo "Failed to invoke Step Function. Error:"
        echo "$invoke_output"
        exit 1
    fi
}

echo "Invoking Step Function"
echo ""

if checkStackExists; then
    step_function_arn=$(getStepFunctionArn)
    invokeStepFunction "$step_function_arn"
else
    echo "Stack $STACK_NAME does not exist. Please create the stack first."
    exit 1
fi

echo "Completed invoking Step Function"
