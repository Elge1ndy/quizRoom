import React from 'react';

const PackSelection = ({ packs, selectedPack, onSelectPack }) => {
    const [filter, setFilter] = React.useState('All');
    const [searchTerm, setSearchTerm] = React.useState('');

    const categories = ['All', ...new Set(packs.map(p => p.category))];

    const filteredPacks = packs
        .filter(p => filter === 'All' || p.category === filter)
        .filter(p => {
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (
                (p.title && p.title.toLowerCase().includes(term)) ||
                (p.description && p.description.toLowerCase().includes(term)) ||
                (p.category && p.category.toLowerCase().includes(term))
            );
        });

    return (
        <div className="w-full">
            {/* Search Input */}
            <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ابحث عن باقة..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                {searchTerm && (
                    <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Category Filters */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setFilter(cat)}
                        className={`
                            px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors
                            ${filter === cat
                                ? 'bg-white text-gray-900 shadow-md'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                            }
                        `}
                    >
                        {cat === 'All' ? 'الكل' : cat}
                    </button>
                ))}
            </div>

            {/* Packs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPacks.map(pack => (
                    <div
                        key={pack.id}
                        onClick={() => onSelectPack(pack)}
                        className={`
                            relative p-5 rounded-xl border-2 cursor-pointer transition-all transform hover:scale-[1.02] active:scale-95
                            ${selectedPack?.id === pack.id
                                ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                            }
                        `}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-4xl">{pack.icon}</span>
                            <span className={`
                                text-xs px-2 py-1 rounded font-bold uppercase tracking-wider
                                ${pack.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400' :
                                    pack.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                        'bg-red-500/20 text-red-400'}
                            `}>
                                {pack.difficulty}
                            </span>
                        </div>

                        <h3 className="text-xl font-bold text-white mb-1">{pack.title}</h3>
                        <p className="text-gray-400 text-sm mb-4 line-clamp-2">{pack.description}</p>

                        <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
                            <span className="flex items-center gap-1">
                                <span>❓</span> {pack?.questionCount || 0} سؤال
                            </span>
                            <span className="flex items-center gap-1">
                                <span>📂</span> {pack.category}
                            </span>
                        </div>

                        {selectedPack?.id === pack.id && (
                            <div className="absolute inset-0 border-2 border-blue-500 rounded-xl pointer-events-none animate-pulse"></div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PackSelection;
