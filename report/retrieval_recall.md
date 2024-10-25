## Context Recall Metric
This metric assesses how well the retrieved context covers all the necessary information to fully answer the user's question.

#### Examples of High Context Recall:
(place holder examples)
- Question: "What are the three states of matter and their characteristics?"
- Retrieved context: "Matter exists in three main states: solid, liquid, and gas. Solids have a fixed shape and volume. Liquids have a fixed volume but take the shape of their container. Gases have no fixed shape or volume and expand to fill their container."
- Generated response: "The three states of matter are solid, liquid, and gas. Solids have a fixed shape and volume. Liquids have a fixed volume but take the shape of their container. Gases have no fixed shape or volume and expand to fill their container."

#### Examples of Low Context Recall:
(place holder examples)
- Question: "What are the three states of matter and their characteristics?"
- Retrieved context: "Matter exists in different states. Solids have a fixed shape, while liquids flow and take the shape of their container."
- Generated response: "Two states of matter are solids and liquids. Solids have a fixed shape, while liquids flow and take the shape of their container."

#### Causes of Low Context Recall
(place holder examples)
- Insufficient retrieval of relevant information
- Narrow focus in the retrieval process
- Missing key aspects of the question in the retrieved context
- Over-emphasis on precision at the expense of completeness
- Poor coverage of multi-faceted questions

#### Ways to Improve Context Recall
(place holder examples)
- Implement query expansion techniques
- Use diverse retrieval methods to capture different aspects of the question
- Employ multi-hop retrieval for complex questions
- Implement iterative retrieval based on initial results
- Use ensemble methods combining multiple retrieval strategies
- Improve named entity recognition and linking in the retrieval process
- Implement knowledge graph-based retrieval to capture related concepts