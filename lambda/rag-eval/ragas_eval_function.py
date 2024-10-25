import json
import os
import boto3
import csv
import io
from evaluation import KnowledgeBasesEvaluations
from observability import BedrockLogs
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_recall,
    answer_similarity,
    context_precision
)

FIREHOSE_NAME = os.environ.get('FirehoseDeliveryStreamName')
bedrock_logs = BedrockLogs(delivery_stream_name=FIREHOSE_NAME)

metrics = [faithfulness,
            answer_relevancy,
            context_recall,
            context_precision]


def read_ground_truth_from_ssm_and_s3(application_name):
    """
    Retrieve ground truth data from S3 using the location stored in SSM Parameter Store.

    :param application_name: The name of the application
    :return: Tuple of (gt_ids, questions, ground_truths) for the specified application
    """
    ssm_client = boto3.client('ssm')
    s3_client = boto3.client('s3')
    
    parameter_name = f"/AppGenAIEvalThresholdMetrics/{application_name}/groundtruth"
    
    try:
        # Get S3 location from SSM
        ssm_response = ssm_client.get_parameter(
            Name=parameter_name,
            WithDecryption=True
        )
        
        s3_location = json.loads(ssm_response['Parameter']['Value'])
        bucket_name = s3_location['bucket']
        file_key = s3_location['prefix'] + 'ground_truth.csv'  # Assuming the file is named 'ground_truth.csv'

        # Read file from S3
        s3_response = s3_client.get_object(Bucket=bucket_name, Key=file_key)
        content = s3_response['Body'].read().decode('utf-8-sig')
        csv_file = io.StringIO(content)
        csv_reader = csv.DictReader(csv_file)
        
        gt_ids = []
        questions = []
        ground_truths = []
        
        for row in csv_reader:
            if row['app_name'] == application_name:
                gt_ids.append(row['gt_id'])
                questions.append(row['question'])
                ground_truths.append(row['ground_truth'])
        
        return gt_ids, questions, ground_truths
    
    except ssm_client.exceptions.ParameterNotFound:
        print(f"SSM Parameter {parameter_name} not found.")
    except json.JSONDecodeError:
        print(f"Error decoding JSON from SSM parameter {parameter_name}.")
    except s3_client.exceptions.NoSuchKey:
        print(f"S3 file not found: {file_key}")
    except Exception as e:
        print(f"An error occurred: {str(e)}")
    
    return [], [], []  # Return empty lists if any error occurs

@bedrock_logs.watch(call_type='RAG-Evaluation')
def test_function(application_metadata):
    question, ground_truth = application_metadata['question'], application_metadata['ground_truth']
    results = {}
    kb_evaluate = KnowledgeBasesEvaluations(model_id_eval=application_metadata['judge_model_id'], 
                          model_id_generation=application_metadata['gen_model_id'], 
                          model_id_embed=application_metadata['embed_model_id'], 
                          num_retriever_results=application_metadata['num_retriever_results'], 
                          metrics=metrics,
                          questions=question, 
                          ground_truth=ground_truth, 
                          KB_ID=application_metadata['kb_id']
                        )
    # temp = kb_evaluate.prepare_evaluation_dataset()
    # print("Evaluation dataset prepared")
    # print(temp)
    kb_evaluate.evaluate() 
    results["evaluation_results"] = kb_evaluate.evaluation_results
    results["questions"] = kb_evaluate.questions
    results["ground_truth"] = kb_evaluate.ground_truth
    results["generated_answers"] = kb_evaluate.generated_answers
    results["contexts"] = kb_evaluate.contexts
    results["experiment_description"] = application_metadata['experiment_description']
    print(results["experiment_description"])
    print(results["evaluation_results"])
    for key, value in results["evaluation_results"].items():
        print(f"{key}: {value}")
    return results


def lambda_handler(event, context):
    
    print(event)
    
    if "runMode" not in event:
        raise ValueError("runMode is missing in the event")

    run_mode = event["runMode"]
    valid_modes = ("benchmark", "validation")

    if run_mode not in valid_modes:
        raise ValueError(f"Invalid runMode: {run_mode}. Expected 'benchmark' or 'validation'")


    experiment_description = event["execution_name"]
    application_name = event["application_name"]
    kb_id = event["kb_id"]
    if isinstance(kb_id, list):
            kb_id = kb_id[0] if kb_id else None  # Use the first element if the list is not empty, otherwise set to None
            
    gen_model_id = event["gen_model_id"]
    judge_model_id = event["judge_model_id"]
    embed_model_id = event["embed_model_id"]
    max_token = event["max_token"]
    temperature = event["temperature"]
    top_p = event["top_p"]
    num_retriever_results = event["num_retriever_results"]
    custom_tag = event["custom_tag"]
    experiment_param = event["experiment_param"]
    eval_results = []

    # Read questions and ground truths from S3
    gt_ids, questions, ground_truths = read_ground_truth_from_ssm_and_s3(application_name)
    
    if gt_ids:
        print(f"Retrieved {len(gt_ids)} ground truth entries for {application_name}")
    else:
        print("Failed to retrieve ground truth data.")

    eval_results = []

    for gt_id, question, ground_truth in zip(gt_ids, questions, ground_truths):
        print("gt_id, question, ground_truth", gt_id, question, ground_truth)
        application_metadata = {
            'question': [question],
            'ground_truth': [ground_truth],
            'experiment_description': experiment_description,
            'application_name': application_name, 
            'gen_model_id': gen_model_id,
            'judge_model_id': judge_model_id,
            'embed_model_id': embed_model_id,
            'num_retriever_results': num_retriever_results,
            'custom_tag': custom_tag,
            'max_token': max_token, 
            'temperature': temperature, 
            'top_p': top_p,
            'kb_id': kb_id
        }
        # execute the test and track it:
        eval_result = test_function(application_metadata)
        core_eval_results = eval_result["evaluation_results"]

        df = core_eval_results.scores.to_pandas()

        # Convert the DataFrame to a dictionary
        core_eval_results_dict = df.to_dict(orient='records')[0]
        core_eval_results_dict['gt_id'] = gt_id
        print("core_eval_results_dict", core_eval_results_dict)
        eval_results.append(core_eval_results_dict)

    print("eval_results: ", eval_results)

    if run_mode == "validation":
        return eval_results
    else:
        return {
            'statusCode': 200,
            'body': "Completed evaluating..."
        }


