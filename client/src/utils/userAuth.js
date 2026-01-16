export const getPersistentUserId = () => {
    let userId = localStorage.getItem('quiz_user_id');
    if (!userId) {
        userId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('quiz_user_id', userId);
    }
    return userId;
};
