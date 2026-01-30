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

/**
 * Registers or updates a player in the database, handling nickname conflicts.
 * 
 * @param {object} supabase - Supabase client instance
 * @param {object} playerProfile - { deviceId, nickname, avatar, last_seen }
 * @param {object} options - { autoHandleConflict: boolean, maxRetries: number }
 * @returns {Promise<{ data: object, error: object, isRenamed: boolean, newNickname: string }>}
 */
export const registerOrUpdatePlayer = async (supabase, playerProfile, options = {}) => {
    const { autoHandleConflict = false, maxRetries = 3 } = options;
    let currentNickname = playerProfile.nickname;
    let attempts = 0;
    let isRenamed = false;

    while (attempts <= maxRetries) {
        attempts++;
        
        const { data, error } = await supabase
            .from('players')
            .upsert({
                ...playerProfile,
                nickname: currentNickname,
                last_seen: new Date().toISOString()
            }, { onConflict: 'device_id' })
            .select()
            .maybeSingle();

        if (!error) {
            return { data, error: null, isRenamed, newNickname: currentNickname };
        }

        // Check for Unique Constraint Violation (Nickname taken)
        if (error.code === '23505' || error.status === 409) {
            if (autoHandleConflict && attempts <= maxRetries) {
                // Generate new nickname and retry
                const suffix = Math.floor(1000 + Math.random() * 9000); // 1000-9999
                // If it already has a #suffix, strip it first to avoid Name#1234#5678
                const baseName = currentNickname.split('#')[0]; 
                currentNickname = `${baseName}#${suffix}`;
                isRenamed = true;
                console.warn(`⚠️ Nickname conflict. Retrying with: ${currentNickname}`);
                continue;
            } else {
                // Return error if we can't auto-handle or ran out of retries
                return { data: null, error: { ...error, customMsg: 'الاسم مستخدم بالفعل (Name taken)' }, isRenamed: false };
            }
        }

        // Other errors
        return { data: null, error, isRenamed: false };
    }
};
