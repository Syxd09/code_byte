import toast from 'react-hot-toast';
import { useState, useEffect } from 'react'
import { X, Plus, Minus, FileText, Settings, Code, HelpCircle, AlertCircle, CheckCircle, Eye, EyeOff, Loader, Sparkles, BookOpen, Target, Clock, Zap } from 'lucide-react'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/themes/prism.css'

const QuestionForm = ({ question = null, onSave, onCancel }) => {
   const [activeTab, setActiveTab] = useState('basic')
   const [isSubmitting, setIsSubmitting] = useState(false)
   const [validationErrors, setValidationErrors] = useState({})
   const [showPreview, setShowPreview] = useState(false)
   const [formData, setFormData] = useState({
     questionText: '',
     questionType: 'mcq',
     codeSnippet: '',
     codeLanguage: 'javascript',
     bugFixCode: '',
     bugFixInstructions: '',
     ideTemplate: '',
     ideLanguage: 'javascript',
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
     crosswordSize: { rows: 10, cols: 10 },
     timeoutLimit: 5000,
     memoryLimit: 256,
     codeTemplate: ''
   })

  useEffect(() => {
    if (question) {
      setFormData({
        questionText: question.question_text || '',
        questionType: question.question_type || 'mcq',
        codeSnippet: question.code_snippet || '',
        codeLanguage: question.code_language || 'javascript',
        bugFixCode: question.bug_fix_code || '',
        bugFixInstructions: question.bug_fix_instructions || '',
        ideTemplate: question.ide_template || '',
        ideLanguage: question.ide_language || 'javascript',
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
        crosswordSize: question.crossword_size ? JSON.parse(question.crossword_size) : { rows: 10, cols: 10 },
        timeoutLimit: question.timeout_limit || 5000,
        memoryLimit: question.memory_limit || 256,
        codeTemplate: question.code_template || ''
      })
    }
  }, [question])

  const validateForm = () => {
    const errors = {}

    // Basic validation
    if (!formData.questionText.trim()) {
      errors.questionText = 'Question text is required'
    }

    if (formData.questionType === 'mcq' && formData.options.filter(opt => opt.trim()).length < 2) {
      errors.options = 'At least 2 options are required for MCQ'
    }

    if (formData.questionType === 'code') {
      if (formData.evaluationMode === 'mcq') {
        if (!formData.codeSnippet.trim()) {
          errors.codeSnippet = 'Code snippet is required for Code Snippet MCQ'
        }
        if (formData.options.filter(opt => opt.trim()).length < 2) {
          errors.codeOptions = 'At least 2 code options are required'
        }
        if (!formData.correctAnswer.trim()) {
          errors.correctAnswer = 'Correct answer must be selected'
        }
      } else if (formData.evaluationMode === 'bugfix') {
        if (!formData.bugFixCode.trim()) {
          errors.bugFixCode = 'Buggy code is required for Bug Fix Mode'
        }
        if (!formData.correctAnswer.trim()) {
          errors.correctAnswer = 'Expected fixed code is required'
        }
      } else if (formData.evaluationMode === 'ide') {
        if (!formData.correctAnswer.trim()) {
          errors.correctAnswer = 'Expected solution code is required for IDE Mode'
        }
      } else if (formData.evaluationMode === 'compiler') {
        if (!formData.testCases.trim()) {
          errors.testCases = 'Test cases are required for compiler evaluation'
        } else {
          try {
            const testCases = JSON.parse(formData.testCases)
            if (!Array.isArray(testCases) || testCases.length === 0) {
              errors.testCases = 'Test cases must be a non-empty array'
            } else {
              for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i]
                if (!testCase.input || !testCase.expectedOutput) {
                  errors.testCases = `Test case ${i + 1} must have input and expectedOutput fields`
                  break
                }
              }
            }
          } catch (error) {
            errors.testCases = 'Test cases must be valid JSON'
          }
        }
      }
    }

    if (formData.questionType === 'image' && !formData.imageUrl) {
      errors.imageUrl = 'Please upload an image for image-based questions'
    }

    if (formData.questionType === 'crossword') {
      if (!formData.crosswordGrid || formData.crosswordGrid.length === 0) {
        errors.crosswordGrid = 'Crossword grid is required'
      }
      if (!formData.crosswordClues || Object.keys(formData.crosswordClues).length === 0) {
        errors.crosswordClues = 'Crossword clues are required'
      }
    }

    // Check for other question types that require correct answer
    if (['mcq', 'truefalse', 'short', 'fill'].includes(formData.questionType) && !formData.correctAnswer.trim()) {
      errors.correctAnswer = 'Correct answer is required'
    }

    return errors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    const errors = validateForm()
    setValidationErrors(errors)

    if (Object.keys(errors).length > 0) {
      // Find the first tab with errors
      const errorFields = Object.keys(errors)
      if (errorFields.includes('questionText') || errorFields.includes('questionType') || errorFields.includes('difficulty')) {
        setActiveTab('basic')
      } else {
        setActiveTab('content')
      }
      setIsSubmitting(false)
      return
    }

    try {
      await onSave(formData)
    } catch (error) {
      console.error('Error saving question:', error)
      setValidationErrors({ submit: 'Failed to save question. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
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

  const validateLanguage = (lang) => {
    const validLanguages = ['javascript', 'python', 'java']
    return validLanguages.includes(lang) ? lang : 'javascript'
  }

  const getLanguageHighlight = (lang = 'javascript') => {
    const validLang = validateLanguage(lang)
    switch (validLang) {
      case 'javascript': return Prism.languages.javascript
      case 'python': return Prism.languages.python
      case 'java': return Prism.languages.java
      default: return Prism.languages.javascript
    }
  }

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: FileText, description: 'Question text and type' },
    { id: 'content', label: 'Question Content', icon: Code, description: 'Answers and code content' },
    { id: 'settings', label: 'Settings', icon: Settings, description: 'Timing and scoring' }
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full mx-4 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 rounded-t-2xl px-8 py-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-dsba-navy rounded-xl">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {question ? 'Edit DSBA Question' : 'Add New DSBA Question'}
              </h3>
              <p className="text-sm text-gray-600">Create engaging questions for your hackathon</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-gray-50 rounded-xl p-2 mb-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const hasErrors = activeTab !== tab.id && Object.keys(validationErrors).some(key => {
              if (tab.id === 'basic') return ['questionText', 'questionType', 'difficulty'].includes(key)
              if (tab.id === 'content') return ['options', 'codeSnippet', 'codeOptions', 'correctAnswer', 'bugFixCode', 'testCases', 'imageUrl', 'crosswordGrid', 'crosswordClues'].includes(key)
              if (tab.id === 'settings') return ['timeLimit', 'marks', 'hintPenalty'].includes(key)
              return false
            })
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-6 py-3 rounded-lg font-semibold text-sm transition-all relative ${
                  activeTab === tab.id
                    ? 'bg-dsba-navy text-white shadow-md'
                    : 'text-gray-600 hover:text-dsba-navy hover:bg-white'
                }`}
                aria-label={`${tab.label}: ${tab.description}`}
              >
                <Icon className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div>{tab.label}</div>
                  <div className="text-xs opacity-75">{tab.description}</div>
                </div>
                {hasErrors && (
                  <AlertCircle className="h-4 w-4 ml-2 text-red-500" />
                )}
              </button>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="questionText" className="block text-sm font-medium text-gray-700">
                    Question Text *
                  </label>
                  <div className="flex items-center space-x-2">
                    <HelpCircle className="h-4 w-4 text-gray-400" />
                    <span className="text-xs text-gray-500">Be clear and specific</span>
                  </div>
                </div>
                <textarea
                  id="questionText"
                  value={formData.questionText}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, questionText: e.target.value }))
                    if (validationErrors.questionText) {
                      setValidationErrors(prev => ({ ...prev, questionText: undefined }))
                    }
                  }}
                  className={`input w-full h-24 resize-none ${validationErrors.questionText ? 'border-red-500 focus:border-red-500' : ''}`}
                  placeholder="Enter your question... (e.g., 'What is the output of the following code?')"
                  required
                  aria-describedby={validationErrors.questionText ? "questionText-error" : undefined}
                />
                {validationErrors.questionText && (
                  <p id="questionText-error" className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {validationErrors.questionText}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Question Type
                  </label>
                  <select
                    value={formData.questionType}
                    onChange={(e) => setFormData(prev => ({ ...prev, questionType: e.target.value }))}
                    className="input w-full"
                    aria-label="Select question type"
                  >
                    <option value="mcq">📝 Multiple Choice</option>
                    <option value="fill">✏️ Fill in the Blank</option>
                    <option value="code">💻 Code Question</option>
                    <option value="truefalse">✓ True/False</option>
                    <option value="short">📄 Short Answer</option>
                    <option value="image">🖼️ Image-based</option>
                    <option value="crossword">🔤 Crossword Puzzle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Difficulty Level
                  </label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value }))}
                    className="input w-full"
                    aria-label="Select difficulty level"
                  >
                    <option value="easy">🟢 Easy (Beginner friendly)</option>
                    <option value="medium">🟡 Medium (Intermediate)</option>
                    <option value="hard">🔴 Hard (Advanced)</option>
                  </select>
                </div>
              </div>

              {/* Preview Toggle */}
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-3">
                  <Eye className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">Live Preview</p>
                    <p className="text-sm text-blue-700">See how participants will view this question</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    showPreview ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  aria-label={showPreview ? "Hide preview" : "Show preview"}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      showPreview ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Question Content Tab */}
          {activeTab === 'content' && (
            <div className="space-y-6">
              {formData.questionType === 'code' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Code Question Variant
                    </label>
                    <select
                      value={formData.evaluationMode}
                      onChange={(e) => setFormData(prev => ({ ...prev, evaluationMode: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="mcq">Code Snippet MCQ (Multiple choice with code options)</option>
                      <option value="bugfix">Bug Fix Mode (Fix the buggy code)</option>
                      <option value="ide">IDE Mode (Write complete solution)</option>
                      <option value="compiler">Compiler Mode (Test against input/output pairs)</option>
                    </select>
                  </div>

                  {formData.evaluationMode === 'mcq' && (
                     <div className="space-y-4">
                       <div>
                         <div className="flex items-center justify-between mb-2">
                           <label className="block text-sm font-medium text-gray-700">
                             Code Snippet *
                           </label>
                           <div className="flex items-center space-x-2">
                             <BookOpen className="h-4 w-4 text-gray-400" />
                             <span className="text-xs text-gray-500">Participants will see this code</span>
                           </div>
                         </div>
                         <select
                           value={formData.codeLanguage}
                           onChange={(e) => setFormData(prev => ({ ...prev, codeLanguage: e.target.value }))}
                           className="input w-full mb-2"
                           aria-label="Select programming language for code snippet"
                         >
                           <option value="javascript">🟨 JavaScript</option>
                           <option value="python">🐍 Python</option>
                           <option value="java">☕ Java</option>
                           <option value="cpp">⚡ C++</option>
                         </select>
                         <div className="relative">
                           <Editor
                             value={formData.codeSnippet}
                             onValueChange={(code) => {
                               setFormData(prev => ({ ...prev, codeSnippet: code }))
                               if (validationErrors.codeSnippet) {
                                 setValidationErrors(prev => ({ ...prev, codeSnippet: undefined }))
                               }
                             }}
                             highlight={(code) => Prism.highlight(code, getLanguageHighlight(formData.codeLanguage))}
                             padding={15}
                             style={{
                               fontFamily: '"Inconsolata", "Monaco", monospace',
                               fontSize: 14,
                               border: validationErrors.codeSnippet ? '1px solid #ef4444' : '1px solid #d1d5db',
                               borderRadius: '0.375rem',
                               minHeight: '120px'
                             }}
                             placeholder="Enter the code snippet for the question..."
                             aria-describedby={validationErrors.codeSnippet ? "codeSnippet-error" : undefined}
                           />
                           {validationErrors.codeSnippet && (
                             <p id="codeSnippet-error" className="mt-1 text-sm text-red-600 flex items-center">
                               <AlertCircle className="h-4 w-4 mr-1" />
                               {validationErrors.codeSnippet}
                             </p>
                           )}
                         </div>
                       </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Answer Options *
                          </label>
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={addOption}
                              className="btn btn-secondary text-xs flex items-center"
                              disabled={formData.options.length >= 6}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Option
                            </button>
                            <span className="text-xs text-gray-500">
                              {formData.options.filter(o => o.trim()).length}/6 options
                            </span>
                          </div>
                        </div>
                        {validationErrors.codeOptions && (
                          <p className="mb-2 text-sm text-red-600 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {validationErrors.codeOptions}
                          </p>
                        )}
                        <div className="space-y-3">
                          {formData.options.map((option, index) => (
                            <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                              <span className="text-sm font-medium text-gray-600 w-6 mt-2">
                                {String.fromCharCode(65 + index)}.
                              </span>
                              <div className="flex-1">
                                <Editor
                                  value={option}
                                  onValueChange={(code) => updateOption(index, code)}
                                  highlight={(code) => Prism.highlight(code, getLanguageHighlight(formData.codeLanguage))}
                                  padding={10}
                                  style={{
                                    fontFamily: '"Inconsolata", "Monaco", monospace',
                                    fontSize: 12,
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem',
                                    minHeight: '60px',
                                    width: '100%'
                                  }}
                                  placeholder={`Enter code option ${String.fromCharCode(65 + index)}`}
                                />
                              </div>
                              {formData.options.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeOption(index)}
                                  className="text-red-500 hover:text-red-700 p-1 mt-2"
                                  aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Correct Answer *
                        </label>
                        <select
                          value={formData.correctAnswer}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))
                            if (validationErrors.correctAnswer) {
                              setValidationErrors(prev => ({ ...prev, correctAnswer: undefined }))
                            }
                          }}
                          className={`input w-full ${validationErrors.correctAnswer ? 'border-red-500 focus:border-red-500' : ''}`}
                          required
                          aria-describedby={validationErrors.correctAnswer ? "correctAnswer-error" : undefined}
                        >
                          <option value="">Select the correct code option</option>
                          {formData.options.map((option, index) => (
                            option.trim() && (
                              <option key={index} value={option}>
                                {String.fromCharCode(65 + index)}. {option.substring(0, 50)}{option.length > 50 ? '...' : ''}
                              </option>
                            )
                          ))}
                        </select>
                        {validationErrors.correctAnswer && (
                          <p id="correctAnswer-error" className="mt-1 text-sm text-red-600 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {validationErrors.correctAnswer}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {formData.evaluationMode === 'bugfix' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Programming Language
                        </label>
                        <select
                          value={formData.codeLanguage}
                          onChange={(e) => setFormData(prev => ({ ...prev, codeLanguage: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Buggy Code
                        </label>
                        <Editor
                          value={formData.bugFixCode}
                          onValueChange={(code) => setFormData(prev => ({ ...prev, bugFixCode: code }))}
                          highlight={(code) => Prism.highlight(code, getLanguageHighlight(formData.codeLanguage))}
                          padding={15}
                          style={{
                            fontFamily: '"Inconsolata", "Monaco", monospace',
                            fontSize: 14,
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            minHeight: '200px'
                          }}
                          placeholder="Enter the buggy code that needs to be fixed..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Bug Fix Instructions
                        </label>
                        <textarea
                          value={formData.bugFixInstructions}
                          onChange={(e) => setFormData(prev => ({ ...prev, bugFixInstructions: e.target.value }))}
                          className="input w-full h-24 resize-none"
                          placeholder="Describe what the bug is and what needs to be fixed..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expected Fixed Code *
                        </label>
                        <Editor
                          value={formData.correctAnswer}
                          onValueChange={(code) => setFormData(prev => ({ ...prev, correctAnswer: code }))}
                          highlight={(code) => Prism.highlight(code, getLanguageHighlight(formData.codeLanguage))}
                          padding={15}
                          style={{
                            fontFamily: '"Inconsolata", "Monaco", monospace',
                            fontSize: 14,
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            minHeight: '200px'
                          }}
                          placeholder="Enter the correct fixed code..."
                        />
                      </div>
                    </div>
                  )}

                  {formData.evaluationMode === 'ide' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Programming Language
                        </label>
                        <select
                          value={formData.ideLanguage}
                          onChange={(e) => setFormData(prev => ({ ...prev, ideLanguage: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Code Template/Boilerplate (Optional starter code)
                        </label>
                        <Editor
                          value={formData.codeTemplate}
                          onValueChange={(code) => setFormData(prev => ({ ...prev, codeTemplate: code }))}
                          highlight={(code) => Prism.highlight(code, getLanguageHighlight(formData.ideLanguage))}
                          padding={15}
                          style={{
                            fontFamily: '"Inconsolata", "Monaco", monospace',
                            fontSize: 14,
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            minHeight: '150px'
                          }}
                          placeholder="Enter starter code or template for the IDE..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expected Solution Code *
                        </label>
                        <Editor
                          value={formData.correctAnswer}
                          onValueChange={(code) => setFormData(prev => ({ ...prev, correctAnswer: code }))}
                          highlight={(code) => Prism.highlight(code, getLanguageHighlight(formData.ideLanguage))}
                          padding={15}
                          style={{
                            fontFamily: '"Inconsolata", "Monaco", monospace',
                            fontSize: 14,
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            minHeight: '200px'
                          }}
                          placeholder="Enter the expected complete solution..."
                        />
                      </div>
                    </div>
                  )}

                  {formData.evaluationMode === 'compiler' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Programming Language
                        </label>
                        <select
                          value={formData.codeLanguage}
                          onChange={(e) => setFormData(prev => ({ ...prev, codeLanguage: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Code Template/Boilerplate (Optional starter code)
                        </label>
                        <Editor
                          value={formData.codeTemplate}
                          onValueChange={(code) => setFormData(prev => ({ ...prev, codeTemplate: code }))}
                          highlight={(code) => Prism.highlight(code, getLanguageHighlight(formData.codeLanguage))}
                          padding={15}
                          style={{
                            fontFamily: '"Inconsolata", "Monaco", monospace',
                            fontSize: 14,
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            minHeight: '150px'
                          }}
                          placeholder="Enter starter code or template for the compiler..."
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Test Cases (Input/Output pairs) *
                          </label>
                          <div className="flex items-center space-x-2">
                            <HelpCircle className="h-4 w-4 text-gray-400" />
                            <span className="text-xs text-gray-500">JSON format required</span>
                          </div>
                        </div>
                        <textarea
                          value={formData.testCases}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, testCases: e.target.value }))
                            if (validationErrors.testCases) {
                              setValidationErrors(prev => ({ ...prev, testCases: undefined }))
                            }
                          }}
                          className={`input w-full h-48 font-mono text-sm resize-none ${validationErrors.testCases ? 'border-red-500 focus:border-red-500' : ''}`}
                          placeholder={`[
 {
   "input": "2 3",
   "expectedOutput": "5",
   "description": "Add two numbers"
 },
 {
   "input": "10 20",
   "expectedOutput": "30",
   "description": "Add larger numbers"
 }
]`}
                          aria-describedby={validationErrors.testCases ? "testCases-error" : undefined}
                        />
                        {validationErrors.testCases && (
                          <p id="testCases-error" className="mt-1 text-sm text-red-600 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {validationErrors.testCases}
                          </p>
                        )}
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <strong>💡 Tip:</strong> Each test case should have <code>input</code>, <code>expectedOutput</code>, and optional <code>description</code> fields.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
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

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Correct Answer *
                    </label>
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
                  </div>
                </div>
              )}

              {formData.questionType === 'truefalse' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Correct Answer *
                  </label>
                  <select
                    value={formData.correctAnswer}
                    onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                    className="input w-full"
                    required
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
                    Correct Answer (Short Answer) *
                  </label>
                  <input
                    type="text"
                    value={formData.correctAnswer}
                    onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                    className="input w-full"
                    placeholder="Enter the expected short answer..."
                    required
                  />
                </div>
              )}

              {formData.questionType === 'fill' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Correct Answer (Fill in the Blank) *
                  </label>
                  <input
                    type="text"
                    value={formData.correctAnswer}
                    onChange={(e) => setFormData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                    className="input w-full"
                    placeholder="Enter the word/phrase to fill in the blank..."
                    required
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
                            toast.error('Failed to upload image');
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
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
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

              {formData.questionType === 'code' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Execution Timeout (ms)
                    </label>
                    <input
                      type="number"
                      value={formData.timeoutLimit}
                      onChange={(e) => setFormData(prev => ({ ...prev, timeoutLimit: parseInt(e.target.value) || 5000 }))}
                      className="input w-full"
                      min="1000"
                      max="30000"
                      step="1000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Memory Limit (MB)
                    </label>
                    <input
                      type="number"
                      value={formData.memoryLimit}
                      onChange={(e) => setFormData(prev => ({ ...prev, memoryLimit: parseInt(e.target.value) || 256 }))}
                      className="input w-full"
                      min="64"
                      max="1024"
                      step="64"
                    />
                  </div>
                </div>
              )}

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

              {formData.questionType === 'code' && formData.evaluationMode === 'compiler' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Test Cases (JSON format)
                  </label>
                  <textarea
                    value={formData.testCases}
                    onChange={(e) => setFormData(prev => ({ ...prev, testCases: e.target.value }))}
                    className="input w-full h-32 font-mono text-sm resize-none"
                    placeholder='[{"input": "2 3", "expectedOutput": "5", "description": "Add two numbers"}, {"input": "10 20", "expectedOutput": "30", "description": "Add larger numbers"}]'
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
            </div>
          )}

          {/* Preview Section */}
          {showPreview && (
            <div className="border-t border-gray-200 pt-6">
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Eye className="h-5 w-5 mr-2" />
                  Question Preview
                </h3>
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                      {formData.questionType.toUpperCase()}
                    </span>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      formData.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                      formData.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {formData.difficulty.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-600">{formData.marks} points</span>
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">
                    {formData.questionText || 'Your question will appear here...'}
                  </h4>
                  {formData.questionType === 'code' && formData.codeSnippet && (
                    <div className="bg-gray-100 p-3 rounded font-mono text-sm mb-4">
                      {formData.codeSnippet.substring(0, 200)}...
                    </div>
                  )}
                  <div className="text-sm text-gray-500">
                    Time limit: {formData.timeLimit}s • {formData.options.filter(o => o.trim()).length} options
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-4 pt-6 border-t border-gray-200">
            {validationErrors.submit && (
              <div className="flex-1 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {validationErrors.submit}
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary flex-1 py-3 text-lg font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <Loader className="h-5 w-5 mr-2 animate-spin" />
                  {question ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  {question ? 'Update Question' : 'Create Question'}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="btn btn-secondary flex-1 py-3 text-lg font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
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