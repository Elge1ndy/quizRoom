import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { getPersistentDeviceId, getPersistentUserId } from '../utils/userAuth';
import { useToast } from '../context/ToastContext';

export const useFriendSystem = () => {
    const { showToast } = useToast();
    const [friends, setFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const userId = getPersistentUserId();

    const fetchFriends = useCallback(async () => {
        const deviceId = getPersistentDeviceId();

        // 1. Fetch Accepted Friends
        const { data: friendsData } = await supabase
            .from('friends')
            .select('*, players!friend_id(nickname, avatar)')
            .eq('user_id', deviceId)
            .eq('status', 'accepted');

        if (friendsData) {
            setFriends(friendsData.map(f => ({
                id: f.friend_id,
                name: f.players?.nickname,
                avatar: f.players?.avatar
            })));
        }

        // 2. Fetch Pending Requests
        const { data: pendingData } = await supabase
            .from('friends')
            .select('user_id')
            .eq('friend_id', deviceId)
            .eq('status', 'pending');

        if (pendingData) {
            setPendingRequests(pendingData.map(p => p.user_id));
        }
    }, []);

    useEffect(() => {
        fetchFriends();

        const deviceId = getPersistentDeviceId();
        const channel = supabase
            .channel('friend_requests')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'friends',
                filter: `friend_id=eq.${deviceId}`
            }, (payload) => {
                setPendingRequests(prev => [...new Set([...prev, payload.new.user_id])]);
                showToast(`📩 طلب صداقة جديد!`, "info");
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'friends',
                filter: `user_id=eq.${deviceId}`
            }, (payload) => {
                if (payload.new.status === 'accepted') {
                    fetchFriends();
                    showToast(`🤝 تم قبول طلب صداقتك!`, "success");
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchFriends]);

    const sendFriendRequest = async (targetId, targetName) => {
        const deviceId = getPersistentDeviceId();
        const { error } = await supabase
            .from('friends')
            .insert({
                user_id: deviceId,
                friend_id: targetId,
                status: 'pending'
            });

        if (!error) {
            showToast(`✅ تم إرسال طلب الصداقة إلى ${targetName}`, "success");
        } else {
            showToast("فشل إرسال الطلب", "error");
        }
    };

    const acceptFriendRequest = async (targetId, targetName, targetAvatar) => {
        const deviceId = getPersistentDeviceId();

        // 1. Update existing request to accepted
        const { error } = await supabase
            .from('friends')
            .update({ status: 'accepted' })
            .eq('user_id', targetId)
            .eq('friend_id', deviceId);

        if (!error) {
            // 2. Add reciprocal friend entry
            await supabase
                .from('friends')
                .insert({
                    user_id: deviceId,
                    friend_id: targetId,
                    status: 'accepted'
                });

            setPendingRequests(prev => prev.filter(id => id !== targetId));
            fetchFriends();
            showToast(`✅ تم قبول طلب صداقة ${targetName}`, "success");
        }
    };

    const rejectFriendRequest = async (targetId) => {
        const deviceId = getPersistentDeviceId();
        const { error } = await supabase
            .from('friends')
            .delete()
            .eq('user_id', targetId)
            .eq('friend_id', deviceId);

        if (!error) {
            setPendingRequests(prev => prev.filter(id => id !== targetId));
            showToast("تم رفض طلب الصداقة", "info");
        }
    };

    return {
        userId,
        friends,
        pendingRequests,
        sendFriendRequest,
        acceptFriendRequest,
        rejectFriendRequest,
        refreshFriends: fetchFriends
    };
};
