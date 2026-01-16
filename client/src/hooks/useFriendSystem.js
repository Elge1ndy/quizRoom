import { useState, useEffect, useCallback } from 'react';
import socket from '../socket';
import { getPersistentUserId } from '../utils/userAuth';
import { useToast } from '../context/ToastContext';

export const useFriendSystem = () => {
    const { showToast } = useToast();
    const [friends, setFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const userId = getPersistentUserId();

    const fetchFriends = useCallback(() => {
        socket.emit('get_friends', userId, (data) => {
            if (data) {
                setFriends(data.friends || []);
                setPendingRequests(data.pending || []);
            }
        });
    }, [userId]);

    useEffect(() => {
        fetchFriends();

        socket.on('friend_request_received', ({ senderId, senderName }) => {
            setPendingRequests(prev => {
                if (prev.includes(senderId)) return prev;
                return [...prev, senderId];
            });
            showToast(`📩 طلب صداقة جديد من ${senderName}`, "info");
        });

        socket.on('friend_request_accepted', ({ userId: friendId, userName, avatar }) => {
            setFriends(prev => {
                const exists = prev.find(f => f.id === friendId);
                if (exists) return prev;
                return [...prev, { id: friendId, name: userName, avatar }];
            });
            showToast(`🤝 أصبح ${userName} صديقك الآن`, "success");
        });

        socket.on('friend_request_rejected', () => {
            // Optional: Handle if needed
        });

        return () => {
            socket.off('friend_request_received');
            socket.off('friend_request_accepted');
            socket.off('friend_request_rejected');
        };
    }, [fetchFriends]);

    const sendFriendRequest = (targetId, targetName) => {
        socket.emit('send_friend_request', {
            senderId: userId,
            targetId,
            senderName: localStorage.getItem('quiz_nickname') || 'لاعب'
        }, (response) => {
            if (response.success) {
                showToast(`✅ تم إرسال طلب الصداقة إلى ${targetName}`, "success");
            } else {
                showToast(response.error || "فشل إرسال الطلب", "error");
            }
        });
    };

    const acceptFriendRequest = (targetId, targetName, targetAvatar) => {
        socket.emit('accept_friend_request', {
            userId,
            targetId,
            userName: localStorage.getItem('quiz_nickname') || 'لاعب',
            userAvatar: localStorage.getItem('quiz_avatar') || '👤',
            targetName,
            targetAvatar
        }, (response) => {
            if (response.success) {
                setPendingRequests(prev => prev.filter(id => id !== targetId));
                setFriends(prev => {
                    const exists = prev.find(f => f.id === targetId);
                    if (exists) return prev;
                    return [...prev, { id: targetId, name: targetName, avatar: targetAvatar }];
                });
                showToast(`✅ تم قبول طلب صداقة ${targetName}`, "success");
            }
        });
    };

    const rejectFriendRequest = (targetId) => {
        socket.emit('reject_friend_request', { userId, targetId }, (response) => {
            if (response.success) {
                setPendingRequests(prev => prev.filter(id => id !== targetId));
                showToast("تم رفض طلب الصداقة", "info");
            }
        });
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
