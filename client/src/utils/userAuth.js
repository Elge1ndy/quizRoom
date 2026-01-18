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

export const getPersistentDeviceId = () => {
    let id = localStorage.getItem('quiz_device_id');
    if (!id) {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                id = crypto.randomUUID();
            } else {
                id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
            }
        } catch (e) {
            id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        }
        localStorage.setItem('quiz_device_id', id);
    }
    return id;
};
