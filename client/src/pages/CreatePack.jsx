import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import socket from '../socket';

const CreatePack = () => {
    // Pack Metadata
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('General Knowledge');
    const [difficulty, setDifficulty] = useState('Medium');
    const [description, setDescription] = useState('');

    // Question Builder State
    const [questions, setQuestions] = useState([]);
    const [currentQType, setCurrentQType] = useState('mcq'); // 'mcq' or 'text'
    const [currentQText, setCurrentQText] = useState('');
    const [options, setOptions] = useState(['', '', '', '']); // 4 options for MCQ
    const [correctOptionIdx, setCorrectOptionIdx] = useState(0);
    const [textAnswer, setTextAnswer] = useState('');

    const categories = ['General Knowledge', 'Science', 'History', 'Sports', 'Geography', 'Arts', 'Technology'];

    const addQuestion = () => {
        if (!currentQText.trim()) return alert("Please enter a question text");

        let newQuestion = {
            id: Date.now().toString(),
            question: currentQText,
            type: currentQType
        };

        if (currentQType === 'mcq') {
            if (options.some(opt => !opt.trim())) return alert("Please fill all options");
            newQuestion.options = options;
            newQuestion.correctAnswer = options[correctOptionIdx];
        } else {
            if (!textAnswer.trim()) return alert("Please enter the correct answer");
            newQuestion.correctAnswer = textAnswer;
        }

        setQuestions([...questions, newQuestion]);

        // Reset Form
        setCurrentQText('');
        setOptions(['', '', '', '']);
        setCorrectOptionIdx(0);
        setTextAnswer('');
    };

    const removeQuestion = (id) => {
        setQuestions(questions.filter(q => q.id !== id));
    };

    const savePack = () => {
        if (!title.trim()) return alert("Please enter a pack title");
        if (questions.length === 0) return alert("Please add at least one question");

        const newPack = {
            title,
            category,
            difficulty,
            description,
            icon: "🎨", // Default icon for custom packs
            questions
        };

        socket.emit('save_pack', newPack, (response) => {
            if (response.success) {
                alert("Pack saved successfully! You can now host it.");
                // Optionally redirect
            }
        });
    };

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white font-sans pb-20">
            <Navbar />

            <div className="max-w-5xl mx-auto px-4 pt-32">
                <h1 className="text-3xl font-black mb-8 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                    🛠️ إنشاء حزمة أسئلة جديدة
                </h1>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LEFT COLUMN: Pack Metadata & Question Builder */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* 1. Pack Metadata */}
                        <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                            <h2 className="text-xl font-bold mb-4 text-blue-300">1. معلومات الحزمة</h2>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="col-span-2">
                                    <label className="block text-gray-400 text-sm mb-1">عنوان الحزمة</label>
                                    <input
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 focus:border-blue-500 outline-none"
                                        placeholder="مثال: تحدي الكيبوب 2024"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">الفئة</label>
                                    <select
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 outline-none"
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                    >
                                        {categories.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">الصعوبة</label>
                                    <select
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 outline-none"
                                        value={difficulty}
                                        onChange={e => setDifficulty(e.target.value)}
                                    >
                                        <option>Easy</option>
                                        <option>Medium</option>
                                        <option>Hard</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 2. Question Builder */}
                        <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                            <h2 className="text-xl font-bold mb-4 text-green-300">2. إضافة سؤال</h2>

                            {/* Type Toggle */}
                            <div className="flex gap-4 mb-4">
                                <button
                                    onClick={() => setCurrentQType('mcq')}
                                    className={`flex-1 py-2 rounded-lg font-bold transition-all ${currentQType === 'mcq' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                                >
                                    اختيارات (MCQ)
                                </button>
                                <button
                                    onClick={() => setCurrentQType('text')}
                                    className={`flex-1 py-2 rounded-lg font-bold transition-all ${currentQType === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                                >
                                    نصي (Text Input)
                                </button>
                            </div>

                            <textarea
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4 focus:border-blue-500 outline-none h-24 text-lg text-right"
                                placeholder="اكتب نص السؤال هنا..."
                                value={currentQText}
                                onChange={e => setCurrentQText(e.target.value)}
                                dir="rtl"
                            />

                            {/* Options for MCQ */}
                            {currentQType === 'mcq' && (
                                <div className="space-y-3 mb-6">
                                    <label className="text-gray-400 text-sm">أدخل الخيارات وحدد الإجابة الصحيحة:</label>
                                    {options.map((opt, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <input
                                                type="radio"
                                                name="correctOption"
                                                checked={correctOptionIdx === idx}
                                                onChange={() => setCorrectOptionIdx(idx)}
                                                className="w-5 h-5 accent-green-500"
                                            />
                                            <input
                                                className={`flex-1 bg-gray-900 border ${correctOptionIdx === idx ? 'border-green-500' : 'border-gray-700'} rounded-lg p-2 outline-none`}
                                                placeholder={`خيار ${idx + 1}`}
                                                value={opt}
                                                onChange={e => {
                                                    const newOpts = [...options];
                                                    newOpts[idx] = e.target.value;
                                                    setOptions(newOpts);
                                                }}
                                                dir="rtl"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Answer for Text */}
                            {currentQType === 'text' && (
                                <div className="mb-6">
                                    <label className="text-gray-400 text-sm block mb-1">الإجابة الصحيحة:</label>
                                    <input
                                        className="w-full bg-gray-900 border border-green-500/50 rounded-lg p-3 outline-none"
                                        placeholder="الإجابة النموذجية"
                                        value={textAnswer}
                                        onChange={e => setTextAnswer(e.target.value)}
                                        dir="rtl"
                                    />
                                </div>
                            )}

                            <button
                                onClick={addQuestion}
                                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl font-bold shadow-lg transition-transform active:scale-95"
                            >
                                + أضف السؤال
                            </button>
                        </div>

                    </div>

                    {/* RIGHT COLUMN: Preview & Save */}
                    <div className="space-y-8">
                        <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 sticky top-32">
                            <h2 className="text-xl font-bold mb-4 flex justify-between items-center text-yellow-300">
                                <span>3. المعاينة</span>
                                <span className="text-sm bg-gray-700 px-2 py-1 rounded text-white">{questions.length} أسئلة</span>
                            </h2>

                            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-6 pr-2 custom-scrollbar">
                                {questions.length === 0 ? (
                                    <div className="text-gray-500 text-center py-8 italic border-2 border-dashed border-gray-700 rounded-xl">
                                        لم تقم بإضافة أسئلة بعد
                                    </div>
                                ) : (
                                    questions.map((q, idx) => (
                                        <div key={q.id} className="bg-gray-700/50 p-4 rounded-xl border border-gray-600 relative group text-right">
                                            <button
                                                onClick={() => removeQuestion(q.id)}
                                                className="absolute top-2 left-2 text-red-400 hover:bg-red-500/20 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                🗑️
                                            </button>
                                            <div className="text-xs text-gray-400 mb-1 flex justify-end gap-2">
                                                <span>#{idx + 1}</span>
                                                <span className="uppercase font-mono bg-black/20 px-1 rounded">{q.type}</span>
                                            </div>
                                            <p className="font-bold mb-2">{q.question}</p>
                                            <div className="text-sm text-green-400 bg-green-900/20 px-2 py-1 rounded inline-block">
                                                Answer: {q.correctAnswer}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <button
                                onClick={savePack}
                                disabled={questions.length === 0}
                                className={`w-full py-4 rounded-xl font-bold text-xl shadow-lg transition-all
                                    ${questions.length > 0
                                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:scale-[1.02] text-white'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                                `}
                            >
                                💾 حفظ الحزمة
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default CreatePack;
