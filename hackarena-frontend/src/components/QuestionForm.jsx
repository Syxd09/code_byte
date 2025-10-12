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
    explanation: ''
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
        explanation: question.explanation || ''
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
            <input
              type="text"
              value={formData.correctAnswer}
              onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
              className="input w-full"
              placeholder="Enter the correct answer..."
              required
            />
          </div>

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