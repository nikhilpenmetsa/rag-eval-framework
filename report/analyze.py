import matplotlib.pyplot as plt
import json
import streamlit as st
import boto3
from datetime import datetime
import pandas as pd
import numpy as np
import requests

def getRegion():
    imds_root = "http://169.254.169.254"
    imds_token_url = f"{imds_root}/latest/api/token"
    imds_identity_url = f"{imds_root}/latest/dynamic/instance-identity/document"

    try:
        # Get the IMDSv2 token
        token_response = requests.put(imds_token_url, headers={"X-aws-ec2-metadata-token-ttl-seconds": "300"}, timeout=5)
        token = token_response.text

        # Get the instance identity document
        identity_headers = {"X-aws-ec2-metadata-token": token}
        identity_response = requests.get(imds_identity_url, headers=identity_headers, timeout=5, verify=False)
        identity_response.raise_for_status()
        instance_identity = identity_response.json()
        region = instance_identity.get("region")
        return region
    except requests.exceptions.RequestException as e:
        print(f"Error retrieving instance region: {e}")
        return None


region = getRegion()

st.set_page_config(layout="wide")

# Create a boto3 client for Step Functions
sfn = boto3.client('stepfunctions', region_name=region)
#sfn = boto3.Session().client('stepfunctions')
#sfn = boto3.Session(profile_name='hub-account').client('stepfunctions')

def query_athena(query):

    boto3_session = boto3.Session()
    #boto3_session = boto3.Session(profile_name='hub-account')
    # self.bedrock_client = boto3_session.client('bedrock-runtime')
    # self.bedrock_agent_client = boto3_session.client("bedrock-agent-runtime")


    #athena = boto3_session.client('athena')
    athena = boto3.client('athena', region_name=region)
    response = athena.start_query_execution(
        QueryString=query,
        QueryExecutionContext={
            'Database': 'observability-882641078759-glue-database-evalappf'
        },
        # ResultConfiguration={
        #     'OutputLocation': 's3://sym-eba-observability-882641078759/athena-results/'
        # },
        WorkGroup='my-athena-workgroup'
    )
    query_execution_id = response['QueryExecutionId']
    print("query_execution_id", query_execution_id)
    while True:
        query_status = athena.get_query_execution(QueryExecutionId=query_execution_id)['QueryExecution']['Status']['State']
        print("query_status", query_status)
        if query_status == 'SUCCEEDED':
            break
        elif query_status == 'FAILED':
            print("query_status", query_status)
            raise Exception(f"Athena query failed: {athena.get_query_execution(QueryExecutionId=query_execution_id)['QueryExecution']['Status']}")
    
    results = athena.get_query_results(QueryExecutionId=query_execution_id)
    columns = [col['Label'] for col in results['ResultSet']['ResultSetMetadata']['ColumnInfo']]
    data = []
    for row in results['ResultSet']['Rows'][1:]:  # Skip header row
        data.append([field.get('VarCharValue', '') for field in row['Data']])

    df = pd.DataFrame(data, columns=columns)
    print("###")
    print(df)

    #result = athena.get_query_results(QueryExecutionId=query_execution_id)['ResultSet']['Rows']
    #print(athena.get_query_results(QueryExecutionId=query_execution_id)['ResultSet'])
    return df


def load_markdown(filename):
    with open(filename, 'r') as file:
        return file.read()


def get_execution_details(execution_arn):
    """Get details of a specific execution"""
    response = sfn.describe_execution(executionArn=execution_arn)
    return response


def list_sfn_executions():
    """List all executions of a step function"""
    #sfn_arn = "arn:aws:states:us-east-1:882641078759:stateMachine:Eval-Workflow"
    sfn_arn = "arn:aws:states:us-east-1:882641078759:stateMachine:Eval-Workflow-V2"
    

    # Initialize checkbox states
    if 'show_faithfulness' not in st.session_state:
        st.session_state.show_faithfulness = True
    if 'show_relevancy' not in st.session_state:
        st.session_state.show_relevancy = True
    if 'show_recall' not in st.session_state:
        st.session_state.show_recall = True
    if 'show_precision' not in st.session_state:
        st.session_state.show_precision = True

    # Sidebar
    st.sidebar.header("Evaluation Benchmarks")

    # List all executions of the step function
    response = sfn.list_executions(
        stateMachineArn=sfn_arn,
        statusFilter='SUCCEEDED'
    )

    # Create a dropdown in the sidebar
    execution_options = ["Select an evaluation"] + [f"{execution['name']}"
                                                   for execution in response['executions']]
    selected_execution = st.sidebar.selectbox("Select an evaluation", execution_options)

    # Create select boxes for each metric in the sidebar
    st.sidebar.subheader("Metrics to plot")
    st.session_state.show_faithfulness = st.sidebar.checkbox("Faithfulness", value=st.session_state.show_faithfulness)
    st.session_state.show_relevancy = st.sidebar.checkbox("Relevancy", value=st.session_state.show_relevancy)
    st.session_state.show_recall = st.sidebar.checkbox("Recall", value=st.session_state.show_recall)
    st.session_state.show_precision = st.sidebar.checkbox("Precision", value=st.session_state.show_precision)

    # Main content area
    if selected_execution != "Select an evaluation":
        try:
            # Find the selected execution
            selected_execution_arn = next(execution['executionArn'] for execution in response['executions']
                                          if f"{execution['name']}" == selected_execution)

            # Get execution details
            execution_details = get_execution_details(selected_execution_arn)
            experiment_id = execution_details['name']

            print(execution_details)
            print("----------------")
            execution_details_dict = json.loads(execution_details['input'])
            print(execution_details_dict)

            
            # Display execution details
            #st.subheader("Execution Details")
            # st.write(f"**Start:** {execution_details['startDate'].strftime('%Y-%m-%d %H:%M:%S')}")
            # st.write(f"**Stop:** {execution_details['stopDate'].strftime('%Y-%m-%d %H:%M:%S')}")

            # Display input
            # experiment_param = execution_details_dict['experiment_param']
            # param_values = execution_details_dict[experiment_param]
            # capital_experiment_param = experiment_param.capitalize()
            # st.write(f"**Benchmark Parameter:** {experiment_param}")
            # st.write(f"**{capital_experiment_param} values :** {param_values}")
            #st.write(execution_details_dict)


            #SELECT * FROM "observability-882641078759-glue-database-20241018"."firehose_data"
            print("experiment_id", experiment_id)
            query = f'''
            SELECT
                *
            FROM "AwsDataCatalog"."observability-882641078759-glue-database-evalappf"."firehose_data"
            WHERE experiment_id like '{experiment_id}';
            '''                

            results_df = query_athena(query)
            renamed_results_df = results_df.rename(
                columns={
                    'input_log_temperature': 'temperature',
                    'input_log_kb_id': 'kb_id',
                    'output_log_evaluation_results_faithfulness': 'generation_faithfulness',
                    'output_log_evaluation_results_answer_relevancy': 'generation_relevancy',
                    'output_log_evaluation_results_context_recall': 'retrieval_recall',
                    'output_log_evaluation_results_context_precision': 'retrieval_precision'
                }
            )

            subset_df = renamed_results_df[[
                    'run_id', 
                    'duration', 
                    'temperature', 
                    'kb_id', 
                    'generation_faithfulness',
                    'generation_relevancy',
                    'retrieval_recall',
                    'retrieval_precision'
                ]
            ]


            # Convert columns to numeric types
            numeric_cols = ['generation_faithfulness', 'generation_relevancy', 'retrieval_recall', 'retrieval_precision']

            for col in numeric_cols:
                subset_df[col] = pd.to_numeric(subset_df[col], errors='coerce')

            # Replace any remaining non-numeric values with NaN
            subset_df[numeric_cols] = subset_df[numeric_cols].replace([np.inf, -np.inf], np.nan)

            # First, let's determine which grouping variable to use
            #grouping_variable = 'temperature' if 'temperature' in subset_df.columns else 'kb_id'
            grouping_variable = execution_details_dict['experiment_param']

            # Now, let's create the new DataFrame with averages
            average_df = subset_df.groupby(grouping_variable)[numeric_cols].mean().reset_index()

            # Optionally, round the results to a specific number of decimal places
            average_df = average_df.round(4)

            # Display the resulting DataFrame
            #print(average_df)
            # num_rows = len(results_df)
            # experiment_param = execution_details_dict['experiment_param']
            # param_values = execution_details_dict[experiment_param]
            # param_values_len = len(param_values)
            # print(f"Number of rows: {num_rows}")
            # print(f"Number of {experiment_param} values: {param_values_len}")


            # Create the plot
            fig, ax = plt.subplots(figsize=(12, 6))  # Increased size for better visibility

            # Plot bars for each selected metric
            bar_width = 0.2
            index = np.arange(len(average_df))
            current_index = index

            metrics = []
            if st.session_state.show_faithfulness:
                ax.bar(current_index, average_df['generation_faithfulness'], bar_width, label='Faithfulness')
                current_index = current_index + bar_width
                metrics.append('generation_faithfulness')
            if st.session_state.show_relevancy:
                ax.bar(current_index, average_df['generation_relevancy'], bar_width, label='Relevancy')
                current_index = current_index + bar_width
                metrics.append('generation_relevancy')
            if st.session_state.show_recall:
                ax.bar(current_index, average_df['retrieval_recall'], bar_width, label='Recall')
                current_index = current_index + bar_width
                metrics.append('retrieval_recall')
            if st.session_state.show_precision:
                ax.bar(current_index, average_df['retrieval_precision'], bar_width, label='Precision')
                metrics.append('retrieval_precision')

            # Customize the plot
            ax.set_title(f"Evaluation Benchmark: Metrics by {grouping_variable.capitalize()}")

            ax.set_xlabel(grouping_variable)
            ax.set_ylabel('Average Score')
            ax.set_title(f'Average Metrics by {grouping_variable.capitalize()}')
            ax.set_xticks(index + bar_width * (len(metrics) - 1) / 2)
            ax.set_xticklabels(average_df[grouping_variable])
            ax.legend()

            plt.tight_layout()

            # Display the plot in Streamlit
            #st.pyplot(fig)

            container = st.container()
            with container:
                col1, col2 = st.columns([1, 2])
                with col1:
                    st.subheader("Evaluation details")
                    experiment_param = execution_details_dict['experiment_param']
                    param_values = execution_details_dict[experiment_param]
                    capital_experiment_param = experiment_param.capitalize()

                    total_evaluations = len(results_df)
                    number_of_experiments = len(param_values)
                    number_of_gt_questions_used = int(total_evaluations/number_of_experiments)

                    col12, col22 = st.columns(2)
                    with col12:
                        st.metric(
                            label="Benchmark Parameter",
                            value=capital_experiment_param,
                            help="The parameter used for benchmarking in this experiment"
                        )
                        st.metric(
                            label=f"{capital_experiment_param} Values",
                            value=str(param_values),  # Convert to string in case it's not already
                            help=f"The values used for the {experiment_param} in this experiment"
                        )

                    with col22:
                        st.metric(
                            label="Total Number of Evaluations",
                            value=f"{total_evaluations:,}",
                            help="The total count of all evaluations performed across all experiments and parameters"
                        )

                        st.metric(
                            label="Number of Ground Truth Questions Used",
                            value=f"{number_of_gt_questions_used:,}",
                            help="The number of unique ground truth questions used in the evaluation process"
                        )


                    html_table = "<table>"
                    for key, value in execution_details_dict.items():
                        html_table += f"<tr><td><b>{key}</b></td><td>{value}</td></tr>"
                    html_table += "</table>"
                    st.markdown(html_table, unsafe_allow_html=True)
                    # Table content
                with col2:
                    #st.pyplot(fig)
                    st.subheader(f"Evaluation Benchmark: Metrics by {grouping_variable.capitalize()}")
                    #ax.set_title(f"Evaluation Benchmark: Metrics by {grouping_variable.capitalize()}")
                    st.pyplot(fig, use_container_width=True)
                    st.subheader(f"Average Performance Metrics by {grouping_variable.capitalize()}")
                    st.markdown(average_df.to_html(), unsafe_allow_html=True)
                    # Plot content



            # Display the DataFrame with selected metrics
            #st.subheader("Data Table")
            #st.markdown(average_df.to_html(), unsafe_allow_html=True)

            if st.session_state.show_faithfulness:
                st.markdown(load_markdown('generation_faithfulness.md'))
            if st.session_state.show_relevancy:
                st.markdown(load_markdown('generation_relevancy.md'))
            if st.session_state.show_recall:
                st.markdown(load_markdown('retrieval_recall.md'))
            if st.session_state.show_precision:
                st.markdown(load_markdown('retrieval_precision.md'))


        except StopIteration:
            st.error("Error: Could not find the selected execution. Please try selecting again.")
    else:
        st.write("Please select an evaluation to view its details and metrics.")

# Call the function to run the Streamlit app
list_sfn_executions()
