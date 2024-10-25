import boto3
import pprint
from botocore.client import Config
from langchain_aws.chat_models.bedrock import ChatBedrock
from langchain_aws.embeddings.bedrock import BedrockEmbeddings
from langchain_aws.retrievers.bedrock import AmazonKnowledgeBasesRetriever
from langchain.chains import RetrievalQA
from datasets import Dataset
from ragas import evaluate

# 'model_id_embed' and 'num_retriever_results'",

class KnowledgeBasesEvaluations:
    def __init__(self, model_id_eval: str, model_id_generation: str, model_id_embed: str, metrics: list, questions:list, ground_truth:list, KB_ID:str, num_retriever_results:str):
        self.model_id_eval = model_id_eval
        self.model_id_generation = model_id_generation
        self.model_id_embed = model_id_embed
        self.bedrock_config = Config(connect_timeout=120, read_timeout=120, retries={'max_attempts': 0})
        self.bedrock_client = boto3.client('bedrock-runtime')
        self.bedrock_agent_client = boto3.client("bedrock-agent-runtime",config=self.bedrock_config)

        # boto3_session = boto3.Session(profile_name='hub-account')
        # self.bedrock_client = boto3_session.client('bedrock-runtime')
        # self.bedrock_agent_client = boto3_session.client("bedrock-agent-runtime")


        #bedrock_runtime_client = boto3_session.client('bedrock')
        #bedrock_runtime_client.get_guardrail(guardrailIdentifier='9tonjtfmpx2y')
        #bedrock_runtime_client.list_guardrails(guardrailIdentifier='9tonjtfmpx2y')
        # firehose_client = boto3_session.client('firehose')
        # firehose_client.list_delivery_streams()

        self.retriever = AmazonKnowledgeBasesRetriever(
            # credentials_profile_name = 'hub-account',
            knowledge_base_id=KB_ID,
            retrieval_config={"vectorSearchConfiguration": {"numberOfResults": num_retriever_results}},
        )
        self.llm_for_text_generation = ChatBedrock(model_id=self.model_id_generation, client=self.bedrock_client)
        self.llm_for_evaluation = ChatBedrock(model_id=self.model_id_eval, client=self.bedrock_client)
        self.qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm_for_text_generation, 
            retriever=self.retriever, 
            return_source_documents=True)
        
        self.bedrock_embeddings = BedrockEmbeddings(model_id=model_id_embed,client=self.bedrock_client)
        self.evaluation_results = None
        self.evaluation_metrics = metrics
        self.questions = questions
        self.ground_truth = ground_truth
        self.generated_answers = []
        self.contexts = []

    def prepare_evaluation_dataset(self):
        print("Preparing evaluation dataset...fuinction start v2")
        for query in self.questions:
            self.generated_answers.append(self.qa_chain.invoke(query)["result"])
            self.contexts.append([docs.page_content for docs in self.retriever.invoke(query)])
        # To dict
        data = {
            "question": self.questions,
            "answer": self.generated_answers,
            "contexts": self.contexts,
            "ground_truth": self.ground_truth
        }
        print(data)
        # Convert dict to dataset
        dataset = Dataset.from_dict(data)
        print("Preparing evaluation dataset...fuinction before return")
        return dataset
    
    def evaluate(self):
        dataset = self.prepare_evaluation_dataset()
        #print dataset
        print(dataset)
        self.evaluation_results = evaluate(dataset=dataset,
                                           metrics=self.evaluation_metrics,
                                           llm=self.llm_for_evaluation,
                                           embeddings=self.bedrock_embeddings)
        