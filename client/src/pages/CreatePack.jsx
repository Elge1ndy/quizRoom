import React from 'react';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { getPersistentDeviceId } from '../utils/userAuth';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import realtime from '../realtime';



const CreatePack = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();

    // Pack Metadata
    const [title, setTitle] = React.useState('');
    const [category, setCategory] = React.useState('General Knowledge');
    const [difficulty, setDifficulty] = React.useState('Medium');
    const [description, setDescription] = React.useState('');
    const [isMaintenance, setIsMaintenance] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);


    // Question Builder State
    const [questions, setQuestions] = React.useState([]);
    const [currentQType, setCurrentQType] = React.useState('mcq'); // 'mcq' or 'text'
    const [currentQText, setCurrentQText] = React.useState('');
    const [options, setOptions] = React.useState(['', '', '', '']); // 4 options for MCQ
    const [correctOptionIdx, setCorrectOptionIdx] = React.useState(0);
    const [textAnswer, setTextAnswer] = React.useState('');

    const categories = ['General Knowledge', 'Science', 'History', 'Sports', 'Geography', 'Arts', 'Technology'];

    React.useEffect(() => {
        const fetchInitialData = async () => {
            // Warm up DB
            await supabase.from('custom_packs').select('count', { count: 'exact', head: true });
        };
        fetchInitialData();

        const handleMaint = (payload) => setIsMaintenance(payload.enabled);
        realtime.on('admin_maintenance', handleMaint);

        return () => {
            realtime.off('admin_maintenance', handleMaint);
        };
    }, []);


    const addQuestion = () => {
        if (!currentQText.trim()) return showToast("يرجى إدخال نص السؤال", "warning");

        let newQuestion = {
            id: Date.now().toString(),
            question: currentQText,
            type: currentQType
        };

        if (currentQType === 'mcq') {
            if (options.some(opt => !opt.trim())) return showToast("يرجى ملء جميع الخيارات", "warning");
            newQuestion.options = options;
            newQuestion.correctAnswer = options[correctOptionIdx];
        } else {
            if (!textAnswer.trim()) return showToast("يرجى إدخال الإجابة الصحيحة", "warning");
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

    const savePack = async () => {
        if (isMaintenance) return showToast("⚠️ لا يمكن حفظ الحزمة حالياً بسبب أعمال الصيانة", "error");
        if (!title.trim()) return showToast("يرجى إدخال عنوان للحزمة", "warning");
        if (questions.length === 0) return showToast("يرجى إضافة سؤال واحد على الأقل", "warning");

        setIsSaving(true);
        try {
            const deviceId = getPersistentDeviceId();
            const nickname = localStorage.getItem('quiz_nickname') || 'اسم مستعار';

            // Ensure player exists in DB first to satisfy foreign key constraints
            const { error: playerError } = await supabase.from('players').upsert({
                device_id: deviceId,
                nickname: nickname,
                last_seen: new Date().toISOString()
            }, { onConflict: 'device_id' });

            if (playerError) {
                console.error("Player registration failed:", playerError);
                showToast("فشل التحقق من هوية اللاعب", "error");
                setIsSaving(false);
                return;
            }

            const newPack = {
                creator_id: deviceId,
                name: title,
                category,
                difficulty,
                description,
                icon: "🎨",
                data: questions
            };

            const { error } = await supabase
                .from('custom_packs')
                .insert(newPack);

            if (!error) {
                showToast("تم حفظ الحزمة بنجاح! يمكنك الآن استضافتها. 🎉", "success");
                navigate('/host');
            } else {
                console.error("Save pack error:", error);
                showToast("فشل في حفظ الحزمة: " + (error.message || "خطأ غير معروف"), "error");
            }
        } catch (err) {
            console.error("Unexpected error saving pack:", err);
            showToast("حدث خطأ غير متوقع", "error");
        } finally {
            setIsSaving(false);
        }
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
                                disabled={questions.length === 0 || isSaving || isMaintenance}
                                className={`w-full py-4 rounded-xl font-bold text-xl shadow-lg transition-all flex items-center justify-center gap-2
                                    ${questions.length > 0 && !isSaving && !isMaintenance
                                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:scale-[1.02] text-white shadow-green-900/20'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                                `}
                            >
                                {isSaving ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        جاري الحفظ...
                                    </>
                                ) : (
                                    <>
                                        <span>💾</span> حفظ الحزمة
                                    </>
                                )}
                            </button>
                            {isMaintenance && <p className="text-orange-400 text-xs text-center mt-2 font-bold">⚠️ لا يمكن الحفظ أثناء وضع الصيانة</p>}
                        </div>
                    </div>


                </div>
            </div>
        </div>
    );
};

export default CreatePack;
