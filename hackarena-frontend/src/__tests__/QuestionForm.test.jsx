import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionForm from '../components/QuestionForm';

// Mock fetch for image upload
global.fetch = jest.fn();

describe('QuestionForm Component', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
  });

  it('renders form with default values', () => {
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByText('Add New Question')).toBeInTheDocument();
    expect(screen.getByLabelText(/Question Text/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('mcq')).toBeInTheDocument();
    expect(screen.getByDisplayValue('medium')).toBeInTheDocument();
  });

  it('renders form with existing question data', () => {
    const existingQuestion = {
      question_text: 'What is 2+2?',
      question_type: 'mcq',
      options: ['3', '4', '5', '6'],
      correct_answer: '4',
      marks: 10,
      time_limit: 60,
      difficulty: 'easy'
    };

    render(
      <QuestionForm
        question={existingQuestion}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Edit Question')).toBeInTheDocument();
    expect(screen.getByDisplayValue('What is 2+2?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('easy')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    const submitButton = screen.getByRole('button', { name: /Add Question/i });

    await user.click(submitButton);

    // Should show alert for missing question text
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('handles MCQ question type correctly', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Form should show options for MCQ
    expect(screen.getByText('Options')).toBeInTheDocument();

    // Fill required fields
    const questionInput = screen.getByLabelText(/Question Text/);
    const correctAnswerInput = screen.getByLabelText(/Correct Answer/);

    await user.type(questionInput, 'Test question');
    await user.type(correctAnswerInput, 'A');

    // Add an option
    const optionInputs = screen.getAllByPlaceholderText(/Option [A-D]/);
    await user.type(optionInputs[0], 'Option A');

    const submitButton = screen.getByRole('button', { name: /Add Question/i });
    await user.click(submitButton);

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        questionText: 'Test question',
        questionType: 'mcq',
        correctAnswer: 'A'
      })
    );
  });

  it('handles coding question with AI evaluation', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Change to code type
    const typeSelect = screen.getByDisplayValue('mcq');
    await user.selectOptions(typeSelect, 'code');

    // Should show evaluation mode
    expect(screen.getByText('Evaluation Mode')).toBeInTheDocument();

    // Change to textarea mode
    const evalSelect = screen.getByDisplayValue('MCQ Mode (Auto-check against key)');
    await user.selectOptions(evalSelect, 'textarea');

    // Should show AI validation settings
    expect(screen.getByText('AI Validation Settings (Optional)')).toBeInTheDocument();

    // Fill required fields
    const questionInput = screen.getByLabelText(/Question Text/);
    const correctAnswerTextarea = screen.getByPlaceholderText(/Enter the expected code solution/);

    await user.type(questionInput, 'Write a function to reverse a string');
    await user.type(correctAnswerTextarea, 'function reverse(str) { return str.split("").reverse().join(""); }');

    const submitButton = screen.getByRole('button', { name: /Add Question/i });
    await user.click(submitButton);

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        questionText: 'Write a function to reverse a string',
        questionType: 'code',
        evaluationMode: 'textarea',
        correctAnswer: 'function reverse(str) { return str.split("").reverse().join(""); }'
      })
    );
  });

  it('handles coding question with compiler evaluation', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Change to code type
    const typeSelect = screen.getByDisplayValue('mcq');
    await user.selectOptions(typeSelect, 'code');

    // Change to compiler mode
    const evalSelect = screen.getByDisplayValue('MCQ Mode (Auto-check against key)');
    await user.selectOptions(evalSelect, 'compiler');

    // Should show test cases field
    expect(screen.getByText('Test Cases (JSON format)')).toBeInTheDocument();

    // Fill required fields and test cases
    const questionInput = screen.getByLabelText(/Question Text/);
    const correctAnswerInput = screen.getByLabelText(/Correct Answer/);
    const testCasesTextarea = screen.getByPlaceholderText(/\[{"input": "2 3", "expected": "5"}\]/);

    await user.type(questionInput, 'Write a function to add two numbers');
    await user.type(correctAnswerInput, 'function add(a, b) { return a + b; }');
    await user.type(testCasesTextarea, '[{"input": "2 3", "expected": "5"}, {"input": "10 20", "expected": "30"}]');

    const submitButton = screen.getByRole('button', { name: /Add Question/i });
    await user.click(submitButton);

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        questionText: 'Write a function to add two numbers',
        questionType: 'code',
        evaluationMode: 'compiler',
        testCases: '[{"input": "2 3", "expected": "5"}, {"input": "10 20", "expected": "30"}]'
      })
    );
  });

  it('handles crossword question type', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Change to crossword type
    const typeSelect = screen.getByDisplayValue('mcq');
    await user.selectOptions(typeSelect, 'crossword');

    // Should show crossword configuration
    expect(screen.getByText('Crossword Configuration')).toBeInTheDocument();
    expect(screen.getByText('Rows')).toBeInTheDocument();
    expect(screen.getByText('Columns')).toBeInTheDocument();

    // Fill required fields
    const questionInput = screen.getByLabelText(/Question Text/);
    const correctAnswerInput = screen.getByLabelText(/Correct Answer/);

    await user.type(questionInput, 'Solve this crossword');
    await user.type(correctAnswerInput, 'COMPLETED');

    const submitButton = screen.getByRole('button', { name: /Add Question/i });
    await user.click(submitButton);

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        questionText: 'Solve this crossword',
        questionType: 'crossword',
        correctAnswer: 'COMPLETED'
      })
    );
  });

  it('handles image upload for image-based questions', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Change to image type
    const typeSelect = screen.getByDisplayValue('mcq');
    await user.selectOptions(typeSelect, 'image');

    // Should show image upload
    expect(screen.getByText('Question Image')).toBeInTheDocument();

    // Mock successful upload
    fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ imageUrl: '/uploads/test-image.jpg' })
    });

    // Simulate file selection
    const fileInput = screen.getByLabelText(/Question Image/);
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/games/upload-image', expect.any(Object));
    });
  });

  it('adds and removes options for MCQ', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Should start with 4 options
    let optionInputs = screen.getAllByPlaceholderText(/Option [A-D]/);
    expect(optionInputs).toHaveLength(4);

    // Add option
    const addButton = screen.getByRole('button', { name: /Add Option/i });
    await user.click(addButton);

    // Should now have 5 options
    optionInputs = screen.getAllByPlaceholderText(/Option [A-E]/);
    expect(optionInputs).toHaveLength(5);

    // Remove an option
    const removeButtons = screen.getAllByRole('button', { name: '' }); // Minus buttons
    await user.click(removeButtons[0]);

    // Should now have 4 options again
    optionInputs = screen.getAllByPlaceholderText(/Option [A-D]/);
    expect(optionInputs).toHaveLength(4);
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<QuestionForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });
});