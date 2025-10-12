import { useState, useEffect } from 'react'
import { X, Plus, Minus } from 'lucide-react'

const QuestionForm = ({ question = null, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    questionText: '',
    questionType: 'mcq',
    options: ['', '', '', ''],
    correctAnswer: '',
    hint: '',
    hintPenalty: 10,
    timeLimit: 60,
    marks: 10,
    difficulty: 'medium',
    explanation: '',
    evaluationMode: 'mcq',
    testCases: '',
    aiValidationSettings: '',
    imageUrl: '',
    crosswordGrid: [],
    crosswordClues: {},
    crosswordSize: { rows: 10, cols: 10 }
  })

  useEffect(() => {
    if (question) {
      setFormData({
        questionText: question.question_text || '',
        questionType: question.question_type || 'mcq',
        options: question.options || ['', '', '', ''],
        correctAnswer: question.correct_answer || '',
        hint: question.hint || '',
        hintPenalty: question.hint_penalty || 10,
        timeLimit: question.time_limit || 60,
        marks: question.marks || 10,
        difficulty: question.difficulty || 'medium',
        explanation: question.explanation || '',
        evaluationMode: question.evaluation_mode || 'mcq',
        testCases: question.test_cases || '',
        aiValidationSettings: question.ai_validation_settings || '',
        imageUrl: question.image_url || '',
        crosswordGrid: question.crossword_grid ? JSON.parse(question.crossword_grid) : [],
        crosswordClues: question.crossword_clues ? JSON.parse(question.crossword_clues) : {},
        crosswordSize: question.crossword_size ? JSON.parse(question.crossword_size) : { rows: 10, cols: 10 }
      })
    }
  }, [question])

  const handleSubmit = (e) => {
    e.preventDefault()

    // Validation
    if (!formData.questionText.trim()) {
      alert('Question text is required')
      return
    }

    if (!formData.correctAnswer.trim()) {
      alert('Correct answer is required')
      return
    }

    if (formData.questionType === 'mcq' && formData.options.filter(opt => opt.trim()).length < 2) {
      alert('At least 2 options are required for MCQ')
      return
    }

    if (formData.questionType === 'code' && formData.evaluationMode === 'compiler' && !formData.testCases.trim()) {
      alert('Test cases are required for code questions with compiler evaluation')
      return
    }

    if (formData.questionType === 'image' && !formData.imageUrl) {
      alert('Please upload an image for image-based questions')
      return
    }

    if (formData.questionType === 'crossword') {
      if (!formData.crosswordGrid || formData.crosswordGrid.length === 0) {
        alert('Crossword grid is required')
        return
      }
      if (!formData.crosswordClues || Object.keys(formData.crosswordClues).length === 0) {
        alert('Crossword clues are required')
        return
      }
    }

    onSave(formData)
  }

  const addOption = () => {
    setFormData(prev => ({
      ...prev,
      options: [...prev.options, '']
    }))
  }

  const removeOption = (index) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }))
  }

  const updateOption = (index, value) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? value : opt)
    }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {question ? 'Edit Question' : 'Add New Question'}
          </h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Question Text *
            </label>
            <textarea
              value={formData.questionText}
              onChange={(e) => setFormData(prev => ({ ...prev, questionText: e.target.value }))}
              className="input w-full h-24 resize-none"
              placeholder="Enter your question..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Question Type
              </label>
              <select
                value={formData.questionType}
                onChange={(e) => setFormData(prev => ({ ...prev, questionType: e.target.value }))}
                className="input w-full"
              >
                <option value="mcq">Multiple Choice</option>
                <option value="fill">Fill in the Blank</option>
                <option value="code">Code Snippet</option>
                <option value="truefalse">True/False</option>
                <option value="short">Short Answer</option>
                <option value="image">Image-based</option>
                <option value="crossword">Crossword Puzzle</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty
              </label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value }))}
                className="input w-full"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {formData.questionType === 'code' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Evaluation Mode
              </label>
              <select
                value={formData.evaluationMode}
                onChange={(e) => setFormData(prev => ({ ...prev, evaluationMode: e.target.value }))}
                className="input w-full"
              >
                <option value="mcq">MCQ Mode (Auto-check against key)</option>
                <option value="textarea">Text Area Mode (AI-based semantic validation)</option>
                <option value="compiler">Compiler Mode (Test case validation)</option>
              </select>
            </div>
          )}

          {formData.questionType === 'mcq' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Options</label>
                <button
                  type="button"
                  onClick={addOption}
                  className="btn btn-secondary text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Option
                </button>
              </div>
              <div className="space-y-2">
                {formData.options.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-600 w-6">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className="input flex-1"
                      placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    />
                    {formData.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Correct Answer *
            </label>
            {formData.questionType === 'code' && formData.evaluationMode === 'textarea' ? (
              <textarea
                value={formData.correctAnswer}
                onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                className="input w-full h-24 resize-none font-mono text-sm"
                placeholder="Enter the expected code solution..."
                required
              />
            ) : formData.questionType === 'mcq' ? (
              <select
                value={formData.correctAnswer}
                onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                className="input w-full"
                required
              >
                <option value="">Select correct option</option>
                {formData.options.map((option, index) => (
                  option.trim() && (
                    <option key={index} value={option}>
                      {String.fromCharCode(65 + index)}. {option}
                    </option>
                  )
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.correctAnswer}
                onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                className="input w-full"
                placeholder="Enter the correct answer..."
                required
              />
            )}
          </div>

          {formData.questionType === 'code' && formData.evaluationMode === 'compiler' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Cases (JSON format)
              </label>
              <textarea
                value={formData.testCases}
                onChange={(e) => setFormData(prev => ({ ...prev, testCases: e.target.value }))}
                className="input w-full h-32 font-mono text-sm resize-none"
                placeholder='[{"input": "2 3", "expected": "5"}, {"input": "10 20", "expected": "30"}]'
              />
            </div>
          )}

          {formData.questionType === 'code' && formData.evaluationMode === 'textarea' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI Validation Settings (Optional)
              </label>
              <textarea
                value={formData.aiValidationSettings}
                onChange={(e) => setFormData(prev => ({ ...prev, aiValidationSettings: e.target.value }))}
                className="input w-full h-20 resize-none"
                placeholder="Additional validation rules or settings..."
              />
            </div>
          )}

          {formData.questionType === 'image' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Question Image
              </label>
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const formDataUpload = new FormData();
                      formDataUpload.append('image', file);

                      try {
                        const response = await fetch('/api/games/upload-image', {
                          method: 'POST',
                          body: formDataUpload,
                          headers: {
                            'Authorization': `Bearer ${localStorage.getItem('hackarena_token')}`
                          }
                        });
                        const data = await response.json();
                        setFormData(prev => ({ ...prev, imageUrl: data.imageUrl }));
                      } catch (error) {
                        console.error('Upload failed:', error);
                        alert('Failed to upload image');
                      }
                    }
                  }}
                  className="input w-full"
                />
                {formData.imageUrl && (
                  <div className="mt-2">
                    <img
                      src={`http://localhost:3001${formData.imageUrl}`}
                      alt="Question"
                      className="max-w-full h-48 object-contain border rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {formData.questionType === 'crossword' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Crossword Configuration
              </label>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Rows</label>
                    <input
                      type="number"
                      value={formData.crosswordSize.rows}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        crosswordSize: { ...prev.crosswordSize, rows: parseInt(e.target.value) || 10 }
                      }))}
                      className="input w-full"
                      min="5"
                      max="20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Columns</label>
                    <input
                      type="number"
                      value={formData.crosswordSize.cols}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        crosswordSize: { ...prev.crosswordSize, cols: parseInt(e.target.value) || 10 }
                      }))}
                      className="input w-full"
                      min="5"
                      max="20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-2">Clues (JSON format)</label>
                  <textarea
                    value={JSON.stringify(formData.crosswordClues, null, 2)}
                    onChange={(e) => {
                      try {
                        const clues = JSON.parse(e.target.value);
                        setFormData(prev => ({ ...prev, crosswordClues: clues }));
                      } catch (error) {
                        // Invalid JSON, keep current value
                      }
                    }}
                    className="input w-full h-32 font-mono text-sm"
                    placeholder='{"1A": {"word": "EXAMPLE", "clue": "Sample word"}, "1D": {"word": "TEST", "clue": "Trial run"}}'
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-2">Grid Layout (JSON format)</label>
                  <textarea
                    value={JSON.stringify(formData.crosswordGrid, null, 2)}
                    onChange={(e) => {
                      try {
                        const grid = JSON.parse(e.target.value);
                        setFormData(prev => ({ ...prev, crosswordGrid: grid }));
                      } catch (error) {
                        // Invalid JSON, keep current value
                      }
                    }}
                    className="input w-full h-32 font-mono text-sm"
                    placeholder='[["#", "1A", "2A", "#"], ["1D", "#", "#", "2D"]]'
                  />
                </div>
              </div>
            </div>
          )}

          {formData.questionType === 'truefalse' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Correct Answer
              </label>
              <select
                value={formData.correctAnswer}
                onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                className="input w-full"
              >
                <option value="">Select answer</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </div>
          )}

          {formData.questionType === 'short' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Correct Answer (Short Answer)
              </label>
              <input
                type="text"
                value={formData.correctAnswer}
                onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                className="input w-full"
                placeholder="Enter the expected short answer..."
              />
            </div>
          )}

          {formData.questionType === 'fill' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Correct Answer (Fill in the Blank)
              </label>
              <input
                type="text"
                value={formData.correctAnswer}
                onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                className="input w-full"
                placeholder="Enter the word/phrase to fill in the blank..."
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Limit (seconds)
              </label>
              <input
                type="number"
                value={formData.timeLimit}
                onChange={(e) => setFormData(prev => ({ ...prev, timeLimit: parseInt(e.target.value) || 60 }))}
                className="input w-full"
                min="10"
                max="300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Marks
              </label>
              <input
                type="number"
                value={formData.marks}
                onChange={(e) => setFormData(prev => ({ ...prev, marks: parseInt(e.target.value) || 10 }))}
                className="input w-full"
                min="1"
                max="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hint Penalty
              </label>
              <input
                type="number"
                value={formData.hintPenalty}
                onChange={(e) => setFormData(prev => ({ ...prev, hintPenalty: parseInt(e.target.value) || 10 }))}
                className="input w-full"
                min="0"
                max="50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hint (Optional)
            </label>
            <input
              type="text"
              value={formData.hint}
              onChange={(e) => setFormData(prev => ({ ...prev, hint: e.target.value }))}
              className="input w-full"
              placeholder="Enter a helpful hint..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Explanation (Optional)
            </label>
            <textarea
              value={formData.explanation}
              onChange={(e) => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
              className="input w-full h-20 resize-none"
              placeholder="Explain the answer..."
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="btn btn-primary flex-1"
            >
              {question ? 'Update Question' : 'Add Question'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuestionForm