## Faithfulness Metric

This metric measures how well the generated output aligns with and accurately represents the information in the retrieved documents.

#### Examples of High Faithfulness:
(place holder examples)
- Question : "What is the height of the Eiffel Tower and when was it completed?"
- Retrieved document: "The Eiffel Tower was completed in 1889 and stands 324 meters tall."
- Generated response: "The Eiffel Tower, completed in 1889, has a height of 324 meters."

##### Examples of Low Faithfulness:
(place holder examples)
- Question : "What is the height of the Eiffel Tower and when was it completed?"
- Retrieved document: "The Eiffel Tower was completed in 1889 and stands 324 meters tall."
- Generated response: "The Eiffel Tower, built in 1900, is over 400 meters tall and was designed by Gustave Eiffel."

## Causes of Low Faithfulness
(place holder examples)
- Hallucination by the language model
- Poor retrieval quality (irrelevant or insufficient information)
- Misinterpretation of retrieved information
- Over-reliance on the model's pre-trained knowledge
- Insufficient context or ambiguity in the retrieved information

## Ways to Improve Faithfulness
(place holder examples)
- Improve retrieval quality to ensure relevant and sufficient information
- Fine-tune the language model on domain-specific data
- Implement fact-checking mechanisms
- Use constrained decoding techniques
- Increase the relevance and diversity of retrieved documents
- Implement post-processing steps to verify generated content against retrieved information