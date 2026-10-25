import { useState } from "react";
import { allQuestions } from "../domain/rules";
import { useCase } from "../state/CaseContext";
import { Alert } from "./ui";

export function QuestionPanel() {
  const { medCase, addQuestion, removeQuestion } = useCase();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!medCase) return null;
  const questions = allQuestions(medCase);

  return (
    <section id="questions" className="lb-card lb-stack" aria-labelledby="questions-title">
      <h2 id="questions-title" className="lb-h2">
        Questions for a pharmacist
      </h2>
      <p className="lb-muted">These are questions to ask a person. The demo does not answer them.</p>
      {error ? (
        <Alert tone="rose" title="Question not added">
          <p>{error}</p>
        </Alert>
      ) : null}
      {questions.length === 0 ? <p className="lb-muted">No questions yet.</p> : null}
      <ul className="lb-stack">
        {questions.map((question) => (
          <li key={question.id} className="lb-task">
            <p>{question.text}</p>
            <div className="lb-cluster">
              <span className="lb-pill">{question.source === "system" ? "From the label gaps" : "Your question"}</span>
              {question.source === "user" ? (
                <button type="button" className="lb-btn lb-btn-quiet" onClick={() => removeQuestion(question.id)}>
                  Remove question
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <form
        className="lb-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const problem = addQuestion(text);
          setError(problem);
          if (!problem) setText("");
        }}
      >
        <label className="lb-field" htmlFor="new-question">
          <span>Add a question</span>
          <textarea
            id="new-question"
            className="lb-input"
            maxLength={240}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <button type="submit" className="lb-btn lb-btn-secondary">
          Add question
        </button>
      </form>
    </section>
  );
}
