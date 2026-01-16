const fs = require('fs');
const path = require('path');

class FriendsManager {
    constructor() {
        this.friendsPath = path.join(__dirname, 'data', 'friends.json');
        this.friends = this.loadFriends();
    }

    loadFriends() {
        try {
            if (fs.existsSync(this.friendsPath)) {
                const data = fs.readFileSync(this.friendsPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.error("Error loading friends:", err);
        }
        return {};
    }

    saveFriends() {
        try {
            fs.writeFileSync(this.friendsPath, JSON.stringify(this.friends, null, 2));
        } catch (err) {
            console.error("Error saving friends:", err);
        }
    }

    getFriends(userId) {
        if (!this.friends[userId]) {
            this.friends[userId] = { friends: [], pending: [] };
        }
        return this.friends[userId];
    }

    sendRequest(senderId, targetId) {
        const sender = this.getFriends(senderId);
        const target = this.getFriends(targetId);

        if (senderId === targetId) return { error: "لا يمكنك إضافة نفسك كصديق" };
        if (sender.friends.includes(targetId)) return { error: "هذا المستخدم صديق بالفعل" };
        if (target.pending.includes(senderId)) return { error: "تم إرسال طلب بالفعل" };

        target.pending.push(senderId);
        this.saveFriends();
        return { success: true };
    }

    acceptRequest(userId, targetId, userName, userAvatar, targetName, targetAvatar) {
        const user = this.getFriends(userId);
        const target = this.getFriends(targetId);

        if (!user.pending.includes(targetId)) return { error: "لا يوجد طلب صداقة من هذا المستخدم" };

        // Remove from pending
        user.pending = user.pending.filter(id => id !== targetId);

        // Add to friends with metadata
        const updateFriendsList = (list, friend) => {
            const index = list.findIndex(f => f.id === friend.id);
            if (index === -1) list.push(friend);
            else list[index] = friend;
        };

        updateFriendsList(user.friends, { id: targetId, name: targetName, avatar: targetAvatar });
        updateFriendsList(target.friends, { id: userId, name: userName, avatar: userAvatar });

        this.saveFriends();
        return { success: true };
    }

    rejectRequest(userId, targetId) {
        const user = this.getFriends(userId);
        if (!user.pending.includes(targetId)) return { error: "لا يوجد طلب صداقة من هذا المستخدم" };

        user.pending = user.pending.filter(id => id !== targetId);
        this.saveFriends();
        return { success: true };
    }
}

module.exports = new FriendsManager();
