// Wait for Supabase to be initialized
let supabase;
let currentUser = null;
let userGroups = [];
let userGoals = [];
let currentViewingGoalId = null; // Store goalId for comment reload
let currentViewingGroupId = null; // Store groupId for filtering goals
let groupsCache = null;
let goalsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30000; // 30 seconds
let currentGroupChatId = null; // Store groupId for group chat
let groupChatPollInterval = null; // Polling interval for group chat

// Initialize Supabase when ready
function initSupabase() {
    if (window.supabaseClient) {
        supabase = window.supabaseClient;
        initializeApp();
    } else {
        // Wait a bit and try again
        setTimeout(initSupabase, 100);
    }
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}

function initializeApp() {
    if (!supabase) {
        console.error('Supabase not initialized');
        return;
    }

    // Show status message with better error details
    function showStatus(message, type = 'success', duration = 3000) {
        const statusEl = document.getElementById('statusMessage');
        if (!statusEl) {
            console.warn('Status message element not found');
            return;
        }
        statusEl.textContent = message;
        statusEl.className = `status-message ${type} show`;
        
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, duration);
    }

    // Show loading state
    function showLoading(elementId, message = 'Loading...') {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerHTML = `<p class="loading">${message}</p>`;
        }
    }

    // Modal management with keyboard support
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = ''; // Restore scroll
            
            // Handle message modal cleanup
            if (modalId === 'messageModal') {
                currentMessagingFriendId = null;
                if (messagePollInterval) {
                    clearInterval(messagePollInterval);
                    messagePollInterval = null;
                }
            }
            
            // Reset any forms in the modal
            const forms = modal.querySelectorAll('form');
            forms.forEach(form => {
                form.reset();
                // Clear edit mode if exists
                if (form.dataset.editMode) {
                    form.dataset.editMode = 'false';
                    delete form.dataset.editGoalId;
                    const submitBtn = form.querySelector('button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.textContent = submitBtn.textContent.replace('Update', 'Create').replace('Updating', 'Create');
                    }
                }
            });
        }
    }

    // Close modals when clicking outside, close button, or Escape key
    document.addEventListener('click', (e) => {
        // Only close if clicking directly on modal background, not on modal-content
        if (e.target.classList.contains('modal') && !e.target.closest('.modal-content')) {
            closeModal(e.target.id);
        }
        if (e.target.classList.contains('modal-close')) {
            const modalId = e.target.getAttribute('data-modal');
            closeModal(modalId);
        }
    });

    // Keyboard support - Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                closeModal(activeModal.id);
            }
        }
    });

    // Tab navigation - prevent duplicate listeners
    const navItems = document.querySelectorAll('.nav-item, .desktop-nav-item');
    navItems.forEach(item => {
        // Remove existing listener if any, then add new one
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        newItem.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = newItem.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    function switchTab(tabId) {
        if (!tabId) return; // Safety check
        
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Show selected tab
        const targetTab = document.getElementById(tabId);
        if (!targetTab) {
            console.error(`Tab with id "${tabId}" not found`);
            return;
        }
        targetTab.classList.add('active');
        
        // Update nav items (both mobile and desktop)
        document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const navItems = document.querySelectorAll(`[data-tab="${tabId}"]`);
        navItems.forEach(item => {
            item.classList.add('active');
        });
        
        // Load data for the tab
        if (tabId === 'groupsTab') {
            currentViewingGroupId = null; // Clear group filter when switching to groups tab
            loadGroups();
        } else if (tabId === 'goalsTab') {
            // If no group is selected, clear the filter
            if (!currentViewingGroupId) {
                loadGoals();
            } else {
                // Keep the group filter active
                loadGoals(true);
            }
        } else if (tabId === 'progressTab') {
            currentViewingGroupId = null; // Clear group filter
            loadProgress();
        } else if (tabId === 'friendsTab') {
            currentViewingGroupId = null; // Clear group filter
            loadFriends();
            // Also refresh sidebar friends
            if (typeof loadSidebarFriends === 'function') {
                loadSidebarFriends();
            }
        }
    }

    // Check authentication state
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            showMainApp(session.user);
            // Clear cache on auth change
            clearCache();
        } else {
            currentUser = null;
            showAuthModal();
            clearCache();
        }
    });

    // Check current session on load
    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            currentUser = session.user;
            showMainApp(session.user);
        } else {
            showAuthModal();
        }
    }

    checkSession();

    // Clear cache
    function clearCache() {
        groupsCache = null;
        goalsCache = null;
        cacheTimestamp = null;
    }

    // Show authentication modal
    function showAuthModal() {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }

    // Show main app
    function showMainApp(user) {
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('userName').textContent = user.user_metadata?.name || user.email;
        loadGroups();
        updateLastSeen();
        // Update last seen every 30 seconds
        setInterval(updateLastSeen, 30000);
        // Load dashboard sidebar
        setTimeout(() => {
            loadSidebarFriends();
            updateFriendRequestsBadge();
        }, 500);
    }
    
    // Update last seen timestamp
    async function updateLastSeen() {
        if (!currentUser) return;
        try {
            await supabase
                .from('profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', currentUser.id);
        } catch (error) {
            console.error('Error updating last seen:', error);
        }
    }

    // Switch between login and register forms
    document.getElementById('showRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    });

    document.getElementById('showLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    });

    // Handle registration with improved validation
    const registerForm = document.getElementById('registerFormElement');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const nameInput = document.getElementById('registerName');
            const emailInput = document.getElementById('registerEmail');
            const passwordInput = document.getElementById('registerPassword');
            
            if (!nameInput || !emailInput || !passwordInput) {
                showStatus('Form fields not found', 'error');
                return;
            }
            
            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            // Enhanced validation
            if (!name || name.length < 2) {
                showStatus('Please enter a valid name (at least 2 characters)', 'error');
                nameInput.focus();
                return;
            }
            
            if (!email) {
                showStatus('Please enter your email', 'error');
                emailInput.focus();
                return;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showStatus('Please enter a valid email address', 'error');
                emailInput.focus();
                return;
            }
            
            if (password.length < 6) {
                showStatus('Password must be at least 6 characters', 'error');
                passwordInput.focus();
                return;
            }
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (!submitBtn) {
                showStatus('Submit button not found', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';
            
            try {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            name: name
                        }
                    }
                });
                
                if (error) {
                    throw error;
                }
                
                // Check if email confirmation is required
                if (data && data.user && !data.session) {
                    showStatus('Account created! Please check your email to confirm your account.', 'success', 5000);
                    registerForm.reset();
                    document.getElementById('registerForm').style.display = 'none';
                    document.getElementById('loginForm').style.display = 'block';
                    document.getElementById('loginEmail').value = email;
                } else if (data && data.session) {
                    currentUser = data.user;
                    showMainApp(data.user);
                    showStatus('Account created and logged in successfully!', 'success');
                } else {
                    showStatus('Account created successfully! You can now log in.', 'success');
                    registerForm.reset();
                    document.getElementById('registerForm').style.display = 'none';
                    document.getElementById('loginForm').style.display = 'block';
                    document.getElementById('loginEmail').value = email;
                }
                
            } catch (error) {
                console.error('Registration error:', error);
                showStatus(getErrorMessage(error), 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Register';
            }
        });
    }

    // Handle login with improved validation
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const emailInput = document.getElementById('loginEmail');
            const passwordInput = document.getElementById('loginPassword');
            
            if (!emailInput || !passwordInput) {
                showStatus('Form fields not found', 'error');
                return;
            }
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            // Validation
            if (!email) {
                showStatus('Please enter your email', 'error');
                emailInput.focus();
                return;
            }
            
            if (!password) {
                showStatus('Please enter your password', 'error');
                passwordInput.focus();
                return;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showStatus('Please enter a valid email address', 'error');
                emailInput.focus();
                return;
            }
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (!submitBtn) {
                showStatus('Submit button not found', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
            
            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) {
                    throw error;
                }
                
                if (data && data.session) {
                    currentUser = data.user;
                    showMainApp(data.user);
                    showStatus('Logged in successfully!', 'success');
                } else {
                    setTimeout(async () => {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session) {
                            currentUser = session.user;
                            showMainApp(session.user);
                            showStatus('Logged in successfully!', 'success');
                        }
                    }, 500);
                }
                
                passwordInput.value = '';
                
            } catch (error) {
                console.error('Login error:', error);
                showStatus(getErrorMessage(error), 'error');
                passwordInput.value = '';
                passwordInput.focus();
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Login';
            }
        });
    }

    // Profile dropdown functionality
    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove('show');
            }
        });
    }
    
    // Handle logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            showStatus('Logged out successfully', 'success');
            clearCache();
            if (profileDropdown) {
                profileDropdown.classList.remove('show');
            }
        } catch (error) {
            console.error('Logout error:', error);
            showStatus(getErrorMessage(error), 'error');
        }
    });

    // Get user-friendly error messages with detailed info
    function getErrorMessage(error) {
        if (!error) return 'An error occurred. Please try again.';
        
        const errorMessage = error.message || error.toString();
        if (!errorMessage) return 'An error occurred. Please try again.';
        
        const errorMessages = {
            'User already registered': 'This email is already registered. Please log in instead.',
            'already registered': 'This email is already registered. Please log in instead.',
            'Invalid email': 'Invalid email address format.',
            'invalid email': 'Invalid email address format.',
            'Password should be at least 6 characters': 'Password must be at least 6 characters long.',
            'password': 'Password must be at least 6 characters long.',
            'Email not confirmed': 'Please check your email to confirm your account before logging in.',
            'email not confirmed': 'Please check your email to confirm your account before logging in.',
            'signup_disabled': 'Registration is currently disabled. Please contact support.',
            'email_rate_limit': 'Too many requests. Please wait a few minutes and try again.',
            'Invalid login credentials': 'Incorrect email or password. Please check and try again.',
            'Invalid credentials': 'Incorrect email or password. Please check and try again.',
            'invalid login': 'Incorrect email or password. Please check and try again.',
            'invalid password': 'Incorrect password. Please try again.',
            'User not found': 'No account found with this email. Please register first.',
            'user not found': 'No account found with this email. Please register first.',
            'too many requests': 'Too many login attempts. Please wait a few minutes and try again.',
            'rate limit': 'Too many requests. Please wait a moment and try again.',
            'network': 'Network error. Please check your internet connection and try again.',
            'Network request failed': 'Network error. Please check your internet connection and try again.',
            'duplicate key': 'This entry already exists. Please check your data.',
            'foreign key': 'Invalid reference. The related item may have been deleted.',
            'unique constraint': 'This value already exists. Please use a different value.'
        };
        
        const lowerMessage = errorMessage.toLowerCase();
        for (const [key, value] of Object.entries(errorMessages)) {
            if (lowerMessage.includes(key.toLowerCase())) {
                return value;
            }
        }
        
        // Return detailed error if no match found
        return errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage;
    }

    // ========== GROUPS ==========

    // Load groups with caching
    async function loadGroups(forceRefresh = false) {
        const groupsList = document.getElementById('groupsList');
        showLoading('groupsList', 'Loading groups...');
        
        try {
            // Check cache
            if (!forceRefresh && groupsCache && cacheTimestamp && 
                (Date.now() - cacheTimestamp) < CACHE_DURATION) {
                displayGroups(groupsCache);
                return;
            }
            
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const { data: memberships, error: memError } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            if (memError) throw memError;
            
            if (!memberships || memberships.length === 0) {
                groupsList.innerHTML = '<div class="empty-state"><p>👥 You haven\'t joined any groups yet.</p><p style="margin-top: 10px; font-size: 0.9rem;">Create a group or join one with a code to get started!</p></div>';
                return;
            }
            
            const groupIds = memberships.map(m => m.group_id);
            
            const { data: groups, error } = await supabase
                .from('groups')
                .select('*')
                .in('id', groupIds)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            userGroups = groups || [];
            groupsCache = groups || [];
            cacheTimestamp = Date.now();
            displayGroups(groups || []);
            
            // Also refresh sidebar if active
            if (document.getElementById('groupsDashboard')?.classList.contains('active')) {
                loadSidebarGroups();
            }
        } catch (error) {
            console.error('Error loading groups:', error);
            groupsList.innerHTML = `<div class="empty-state" style="color: var(--error);"><p>❌ Error loading groups</p><p style="font-size: 0.9rem; margin-top: 10px;">${getErrorMessage(error)}</p></div>`;
        }
    }

    // Display groups with leave functionality
    function displayGroups(groups) {
        const groupsList = document.getElementById('groupsList');
        
        if (groups.length === 0) {
            groupsList.innerHTML = '<div class="empty-state"><p>👥 You haven\'t joined any groups yet.</p><p style="margin-top: 10px; font-size: 0.9rem;">Create a group or join one with a code to get started!</p></div>';
            return;
        }
        
        groupsList.innerHTML = groups.map(group => {
            const isOwner = group.created_by === currentUser?.id;
            return `
                <div class="card">
                    <div class="card-header">
                        <div onclick="viewGroup('${group.id}')" style="flex: 1; cursor: pointer;">
                            <div class="card-title">${escapeHtml(group.name)}</div>
                            <div class="card-subtitle">Code: ${escapeHtml(group.code)}</div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-primary btn-small" onclick="openGroupChat('${group.id}', '${escapeHtml(group.name)}')" title="Group Chat">💬</button>
                            <button class="btn btn-secondary btn-small" onclick="openGroupAnalytics('${group.id}', '${escapeHtml(group.name)}')" title="Analytics">📊</button>
                            ${!isOwner ? `<button class="btn btn-danger btn-small" onclick="leaveGroup('${group.id}')" title="Leave Group">Leave</button>` : ''}
                        </div>
                    </div>
                    <div class="card-content" onclick="viewGroup('${group.id}')" style="cursor: pointer;">${escapeHtml(group.description || 'No description')}</div>
                    <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Created ${formatDate(group.created_at)}</span>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); openGroupChat('${group.id}', '${escapeHtml(group.name)}')" style="font-size: 0.8rem;">Chat</button>
                            <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); openGroupAnalytics('${group.id}', '${escapeHtml(group.name)}')" style="font-size: 0.8rem;">Analytics</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Create group with unique code generation - prevent double-clicks
    let isOpeningGroupModal = false;
    document.getElementById('createGroupBtn')?.addEventListener('click', () => {
        if (isOpeningGroupModal) return;
        isOpeningGroupModal = true;
        openModal('createGroupModal');
        setTimeout(() => { isOpeningGroupModal = false; }, 300);
    });

    document.getElementById('createGroupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const name = document.getElementById('groupName').value.trim();
        const description = document.getElementById('groupDescription').value.trim();
        
        // Validation
        if (!name || name.length < 2) {
            showStatus('Group name must be at least 2 characters', 'error');
            return;
        }
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        try {
            // Generate unique code with collision check
            let code;
            let attempts = 0;
            let isUnique = false;
            
            while (!isUnique && attempts < 10) {
                code = Math.random().toString(36).substring(2, 8).toUpperCase();
                const { data: existing } = await supabase
                    .from('groups')
                    .select('id')
                    .eq('code', code)
                    .maybeSingle();
                
                if (!existing) {
                    isUnique = true;
                }
                attempts++;
            }
            
            if (!isUnique) {
                throw new Error('Failed to generate unique group code. Please try again.');
            }
            
            const { data: group, error } = await supabase
                .from('groups')
                .insert([{
                    name: name,
                    description: description,
                    created_by: user.id,
                    code: code
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            // Add creator as member
            await supabase
                .from('group_members')
                .insert([{
                    group_id: group.id,
                    user_id: user.id,
                    role: 'owner'
                }]);
            
            showStatus(`Group created successfully! Code: ${code}`, 'success', 5000);
            closeModal('createGroupModal');
            document.getElementById('createGroupForm').reset();
            clearCache();
            loadGroups(true);
        } catch (error) {
            console.error('Error creating group:', error);
            showStatus(getErrorMessage(error), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Group';
        }
    });

    // Join group - prevent double-clicks
    let isOpeningJoinModal = false;
    document.getElementById('joinGroupBtn')?.addEventListener('click', () => {
        if (isOpeningJoinModal) return;
        isOpeningJoinModal = true;
        openModal('joinGroupModal');
        setTimeout(() => { isOpeningJoinModal = false; }, 300);
    });

    document.getElementById('joinGroupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const code = document.getElementById('groupCode').value.toUpperCase().trim();
        
        if (!code || code.length < 4) {
            showStatus('Please enter a valid group code', 'error');
            return;
        }
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Joining...';
        
        try {
            const { data: group, error: groupError } = await supabase
                .from('groups')
                .select('*')
                .eq('code', code)
                .maybeSingle();
            
            if (groupError || !group) {
                showStatus('Invalid group code. Please check and try again.', 'error');
                return;
            }
            
            // Check if already a member
            const { data: existing } = await supabase
                .from('group_members')
                .select('*')
                .eq('group_id', group.id)
                .eq('user_id', user.id)
                .maybeSingle();
            
            if (existing) {
                showStatus('You are already a member of this group', 'error');
                return;
            }
            
            // Add as member
            const { error } = await supabase
                .from('group_members')
                .insert([{
                    group_id: group.id,
                    user_id: user.id,
                    role: 'member'
                }]);
            
            if (error) throw error;
            
            showStatus(`Successfully joined "${group.name}"!`, 'success');
            closeModal('joinGroupModal');
            document.getElementById('joinGroupForm').reset();
            clearCache();
            loadGroups(true);
        } catch (error) {
            console.error('Error joining group:', error);
            showStatus(getErrorMessage(error), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Join Group';
        }
    });

    // Leave group
    window.leaveGroup = async (groupId) => {
        if (!confirm('Are you sure you want to leave this group? You will lose access to all group goals and progress.')) {
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', user.id);
            
            if (error) throw error;
            
            showStatus('Successfully left the group', 'success');
            clearCache();
            loadGroups(true);
            loadGoals(true);
            loadProgress(true);
        } catch (error) {
            console.error('Error leaving group:', error);
            showStatus(getErrorMessage(error), 'error');
        }
    };

    function viewGroup(groupId) {
        currentViewingGroupId = groupId;
        switchTab('goalsTab');
        // Load goals filtered by this group
        loadGoals(true);
    }

    // ========== GOALS ==========

    // Load goals with caching
    async function loadGoals(forceRefresh = false) {
        const goalsList = document.getElementById('goalsList');
        showLoading('goalsList', 'Loading goals...');
        
        try {
            // Check cache
            if (!forceRefresh && goalsCache && cacheTimestamp && 
                (Date.now() - cacheTimestamp) < CACHE_DURATION) {
                await displayGoals(goalsCache);
                return;
            }
            
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            // Get user's groups (optimized - single query)
            const { data: memberships } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            const groupIds = memberships ? memberships.map(m => m.group_id) : [];
            
            // Optimized query
            let query = supabase
                .from('goals')
                .select('*, groups(name)')
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            
            // If viewing a specific group, filter by that group
            if (currentViewingGroupId) {
                query = query.eq('group_id', currentViewingGroupId);
            } else if (groupIds.length > 0) {
                query = query.or(`user_id.eq.${user.id},group_id.in.(${groupIds.join(',')})`);
            } else {
                query = query.eq('user_id', user.id);
            }
            
            const { data: goals, error } = await query;
            
            if (error) throw error;
            
            userGoals = goals || [];
            goalsCache = goals || [];
            cacheTimestamp = Date.now();
            await displayGoals(goals || []);
            
            // Update goal group dropdown
            updateGoalGroupDropdown();
        } catch (error) {
            console.error('Error loading goals:', error);
            goalsList.innerHTML = `<div class="empty-state" style="color: var(--error);"><p>❌ Error loading goals</p><p style="font-size: 0.9rem; margin-top: 10px;">${getErrorMessage(error)}</p></div>`;
        }
    }

    // Display goals with edit/delete functionality
    async function displayGoals(goals) {
        const goalsList = document.getElementById('goalsList');
        const sectionHeader = document.querySelector('#goalsTab .section-header h2');
        
        // Update header if viewing a specific group
        if (currentViewingGroupId && sectionHeader) {
            const { data: group } = await supabase
                .from('groups')
                .select('name')
                .eq('id', currentViewingGroupId)
                .maybeSingle();
            if (group) {
                sectionHeader.textContent = `${group.name} Goals`;
                // Add back button if it doesn't exist
                const existingBackBtn = document.getElementById('backToAllGoalsBtn');
                if (!existingBackBtn) {
                    const backBtn = document.createElement('button');
                    backBtn.id = 'backToAllGoalsBtn';
                    backBtn.className = 'btn btn-secondary btn-small';
                    backBtn.textContent = '← All Goals';
                    backBtn.onclick = () => {
                        currentViewingGroupId = null;
                        loadGoals(true);
                    };
                    const header = sectionHeader.parentElement;
                    header.insertBefore(backBtn, sectionHeader.nextSibling);
                }
            }
        } else if (sectionHeader) {
            sectionHeader.textContent = 'My Goals';
            const backBtn = document.getElementById('backToAllGoalsBtn');
            if (backBtn) backBtn.remove();
        }
        
        if (goals.length === 0) {
            const emptyMsg = currentViewingGroupId 
                ? '<div class="empty-state"><p>🎯 No goals in this group yet.</p><p style="margin-top: 10px; font-size: 0.9rem;">Create a goal for this group to get started!</p></div>'
                : '<div class="empty-state"><p>🎯 No goals yet.</p><p style="margin-top: 10px; font-size: 0.9rem;">Create your first goal to start tracking your progress!</p></div>';
            goalsList.innerHTML = emptyMsg;
            return;
        }
        
        // Optimized: Single query for all progress counts
        const goalIds = goals.map(g => g.id);
        const { data: progressEntries } = await supabase
            .from('progress_entries')
            .select('goal_id')
            .in('goal_id', goalIds);
        
        // Count progress per goal
        const progressCounts = {};
        if (progressEntries) {
            progressEntries.forEach(entry => {
                progressCounts[entry.goal_id] = (progressCounts[entry.goal_id] || 0) + 1;
            });
        }
        
        // Get reactions for all goals
        const { data: allReactions } = currentUser ? await supabase
            .from('reactions')
            .select('*')
            .in('goal_id', goalIds) : { data: [] };
        
        // Count reactions per goal
        const reactionCounts = {};
        const userReactions = {};
        if (allReactions) {
            allReactions.forEach(reaction => {
                const key = reaction.goal_id;
                if (!reactionCounts[key]) {
                    reactionCounts[key] = { likes: 0, dislikes: 0 };
                }
                if (reaction.reaction_type === 'like') {
                    reactionCounts[key].likes++;
                } else {
                    reactionCounts[key].dislikes++;
                }
                if (reaction.user_id === currentUser?.id) {
                    userReactions[key] = reaction.reaction_type;
                }
            });
        }
        
        goalsList.innerHTML = goals.map(goal => {
            const progressCount = progressCounts[goal.id] || 0;
            const progressPercent = goal.target_days ? Math.min((progressCount / goal.target_days) * 100, 100) : 0;
            const groupName = goal.groups ? ` • ${escapeHtml(goal.groups.name)}` : '';
            const isOwner = goal.user_id === currentUser?.id;
            const reactions = reactionCounts[goal.id] || { likes: 0, dislikes: 0 };
            const userReaction = userReactions[goal.id];
            
            return `
                <div class="card">
                    <div class="card-header">
                        <div onclick="viewGoalDetails('${goal.id}')" style="flex: 1; cursor: pointer;">
                            <div class="card-title">${escapeHtml(goal.title)}${groupName}</div>
                            <div class="card-subtitle">${goal.frequency} • ${progressCount}/${goal.target_days} days</div>
                        </div>
                        ${isOwner ? `
                            <div class="card-actions">
                                <button class="btn btn-secondary btn-small" onclick="editGoal('${goal.id}')" title="Edit Goal">✏️</button>
                                <button class="btn btn-danger btn-small" onclick="deleteGoal('${goal.id}')" title="Delete Goal">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="card-content" onclick="viewGoalDetails('${goal.id}')" style="cursor: pointer;">${escapeHtml(goal.description || 'No description')}</div>
                    <div class="goal-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                        <div class="progress-text">${Math.round(progressPercent)}% complete</div>
                    </div>
                    <div class="reaction-buttons" onclick="event.stopPropagation();">
                        <button class="reaction-btn like ${userReaction === 'like' ? 'active' : ''}" onclick="toggleReaction('${goal.id}', null, 'like')">
                            <span>👍</span>
                            <span class="reaction-count">${reactions.likes}</span>
                        </button>
                        <button class="reaction-btn dislike ${userReaction === 'dislike' ? 'active' : ''}" onclick="toggleReaction('${goal.id}', null, 'dislike')">
                            <span>👎</span>
                            <span class="reaction-count">${reactions.dislikes}</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Update goal group dropdown
    async function updateGoalGroupDropdown() {
        const select = document.getElementById('goalGroup');
        if (!select) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: memberships } = await supabase
            .from('group_members')
            .select('group_id, groups(name)')
            .eq('user_id', user.id);
        
        select.innerHTML = '<option value="">Personal Goal</option>';
        
        if (memberships) {
            memberships.forEach(m => {
                const option = document.createElement('option');
                option.value = m.group_id;
                option.textContent = m.groups.name;
                select.appendChild(option);
            });
        }
    }

    // Create goal - prevent double-clicks
    let isCreatingGoal = false;
    document.getElementById('createGoalBtn')?.addEventListener('click', () => {
        if (isCreatingGoal) return; // Prevent double-clicks
        isCreatingGoal = true;
        
        const form = document.getElementById('createGoalForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        
        // Reset form and clear edit mode
        form.reset();
        form.dataset.editMode = 'false';
        delete form.dataset.editGoalId;
        submitBtn.textContent = 'Create Goal';
        
        updateGoalGroupDropdown();
        openModal('createGoalModal');
        
        setTimeout(() => { isCreatingGoal = false; }, 300);
    });

    document.getElementById('createGoalForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const form = e.target;
        
        // If in edit mode, let the update handler take over
        if (form.dataset.editMode === 'true') {
            return; // Don't create, let update handler process it
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const title = document.getElementById('goalTitle').value.trim();
        const description = document.getElementById('goalDescription').value.trim();
        const groupId = document.getElementById('goalGroup').value || null;
        const frequency = document.getElementById('goalFrequency').value;
        const targetDays = parseInt(document.getElementById('goalTargetDays').value) || 30;
        
        // Validation
        if (!title || title.length < 2) {
            showStatus('Goal title must be at least 2 characters', 'error');
            return;
        }
        
        if (targetDays < 1 || targetDays > 1000) {
            showStatus('Target days must be between 1 and 1000', 'error');
            return;
        }
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        try {
            const { error } = await supabase
                .from('goals')
                .insert([{
                    user_id: user.id,
                    group_id: groupId,
                    title: title,
                    description: description,
                    frequency: frequency,
                    target_days: targetDays,
                    is_active: true
                }]);
            
            if (error) throw error;
            
            showStatus('Goal created successfully!', 'success');
            closeModal('createGoalModal');
            document.getElementById('createGoalForm').reset();
            clearCache();
            loadGoals(true);
        } catch (error) {
            console.error('Error creating goal:', error);
            showStatus(getErrorMessage(error), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Goal';
        }
    });

    // Edit goal
    window.editGoal = async (goalId) => {
        const goal = userGoals.find(g => g.id === goalId);
        if (!goal || goal.user_id !== currentUser?.id) {
            showStatus('You can only edit your own goals', 'error');
            return;
        }
        
        // Populate form
        document.getElementById('goalTitle').value = goal.title;
        document.getElementById('goalDescription').value = goal.description || '';
        document.getElementById('goalFrequency').value = goal.frequency;
        document.getElementById('goalTargetDays').value = goal.target_days;
        
        // Set group if exists
        await updateGoalGroupDropdown();
        if (goal.group_id) {
            document.getElementById('goalGroup').value = goal.group_id;
        }
        
        // Change form to edit mode
        const form = document.getElementById('createGoalForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Update Goal';
        form.dataset.editMode = 'true';
        form.dataset.editGoalId = goalId;
        
        openModal('createGoalModal');
    };

    // Update goal form handler
    document.getElementById('createGoalForm')?.addEventListener('submit', async function(e) {
        if (this.dataset.editMode === 'true') {
            e.preventDefault();
            
            const goalId = this.dataset.editGoalId;
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const title = document.getElementById('goalTitle').value.trim();
            const description = document.getElementById('goalDescription').value.trim();
            const groupId = document.getElementById('goalGroup').value || null;
            const frequency = document.getElementById('goalFrequency').value;
            const targetDays = parseInt(document.getElementById('goalTargetDays').value) || 30;
            
            if (!title || title.length < 2) {
                showStatus('Goal title must be at least 2 characters', 'error');
                return;
            }
            
            const submitBtn = this.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';
            
            try {
                const { error } = await supabase
                    .from('goals')
                    .update({
                        title: title,
                        description: description,
                        group_id: groupId,
                        frequency: frequency,
                        target_days: targetDays
                    })
                    .eq('id', goalId)
                    .eq('user_id', user.id);
                
                if (error) throw error;
                
                showStatus('Goal updated successfully!', 'success');
                closeModal('createGoalModal');
                this.reset();
                this.dataset.editMode = 'false';
                delete this.dataset.editGoalId;
                const submitBtnAfter = this.querySelector('button[type="submit"]');
                submitBtnAfter.textContent = 'Create Goal';
                clearCache();
                loadGoals(true);
            } catch (error) {
                console.error('Error updating goal:', error);
                showStatus(getErrorMessage(error), 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update Goal';
            }
        }
    });

    // Delete goal
    window.deleteGoal = async (goalId) => {
        const goal = userGoals.find(g => g.id === goalId);
        if (!goal || goal.user_id !== currentUser?.id) {
            showStatus('You can only delete your own goals', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete "${goal.title}"? This will also delete all progress entries and comments for this goal.`)) {
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            // Delete goal (cascade will handle progress and comments)
            const { error } = await supabase
                .from('goals')
                .delete()
                .eq('id', goalId)
                .eq('user_id', user.id);
            
            if (error) throw error;
            
            showStatus('Goal deleted successfully', 'success');
            clearCache();
            loadGoals(true);
            loadProgress(true);
        } catch (error) {
            console.error('Error deleting goal:', error);
            showStatus(getErrorMessage(error), 'error');
        }
    };

    // View goal details with stored goalId
    async function viewGoalDetails(goalId) {
        const goal = userGoals.find(g => g.id === goalId);
        let goalToShow = goal;
        
        if (!goalToShow) {
            // Try to fetch if not in cache
            const { data: fetchedGoal, error: fetchError } = await supabase
                .from('goals')
                .select('*')
                .eq('id', goalId)
                .maybeSingle();
            
            if (fetchError || !fetchedGoal) {
                showStatus('Goal not found', 'error');
                return;
            }
            goalToShow = fetchedGoal;
        }
        
        currentViewingGoalId = goalId; // Store for comment reload
        
        document.getElementById('goalDetailsTitle').textContent = goalToShow.title;
        
        showLoading('goalDetailsContent', 'Loading goal details...');
        openModal('goalDetailsModal');
        
        try {
            // Get progress entries
            const { data: entries } = await supabase
                .from('progress_entries')
                .select('*')
                .eq('goal_id', goalId)
                .order('date', { ascending: false });
            
            // Get unique user IDs
            const userIds = [...new Set((entries || []).map(e => e.user_id))];
            
            // Get user profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, email')
                .in('id', userIds);
            
            // Create a map for quick lookup
            const userMap = {};
            if (profiles) {
                profiles.forEach(p => {
                    userMap[p.id] = p.name || p.email || 'Unknown';
                });
            }
            
            // Get user info for entries
            const entriesWithUsers = (entries || []).map(entry => {
                return { ...entry, userName: userMap[entry.user_id] || 'Unknown' };
            });
            
            // Get comments for each entry (optimized - batch query)
            const entryIds = entriesWithUsers.map(e => e.id);
            const { data: allComments } = entryIds.length > 0 ? await supabase
                .from('comments')
                .select('*')
                .in('progress_id', entryIds)
                .order('created_at', { ascending: true }) : { data: [] };
            
            // Get comment user IDs
            const commentUserIds = [...new Set((allComments || []).map(c => c.user_id))];
            const { data: commentProfiles } = commentUserIds.length > 0 ? await supabase
                .from('profiles')
                .select('id, name, email')
                .in('id', commentUserIds) : { data: [] };
            
            const commentUserMap = {};
            if (commentProfiles) {
                commentProfiles.forEach(p => {
                    commentUserMap[p.id] = p.name || p.email || 'Unknown';
                });
            }
            
            // Group comments by progress_id
            const commentsByProgress = {};
            if (allComments) {
                allComments.forEach(comment => {
                    if (!commentsByProgress[comment.progress_id]) {
                        commentsByProgress[comment.progress_id] = [];
                    }
                    commentsByProgress[comment.progress_id].push({
                        ...comment,
                        userName: commentUserMap[comment.user_id] || 'Unknown'
                    });
                });
            }
            
            // Attach comments to entries
            const entriesWithComments = entriesWithUsers.map(entry => ({
                ...entry,
                comments: commentsByProgress[entry.id] || []
            }));
            
            // Get reactions for comments
            const commentIds = (allComments || []).map(c => c.id);
            const { data: commentReactions } = currentUser && commentIds.length > 0 ? await supabase
                .from('reactions')
                .select('*')
                .in('comment_id', commentIds) : { data: [] };
            
            // Count reactions per comment
            const commentReactionCounts = {};
            const userCommentReactions = {};
            if (commentReactions) {
                commentReactions.forEach(reaction => {
                    const key = reaction.comment_id;
                    if (!commentReactionCounts[key]) {
                        commentReactionCounts[key] = { likes: 0, dislikes: 0 };
                    }
                    if (reaction.reaction_type === 'like') {
                        commentReactionCounts[key].likes++;
                    } else {
                        commentReactionCounts[key].dislikes++;
                    }
                    if (reaction.user_id === currentUser?.id) {
                        userCommentReactions[key] = reaction.reaction_type;
                    }
                });
            }
            
            const content = `
                <div style="padding: 20px;">
                    <p style="color: var(--text-light); margin-bottom: 20px;">${escapeHtml(goalToShow.description || 'No description')}</p>
                    
                    <div class="section-header" style="margin-top: 30px;">
                        <h3>Progress Entries</h3>
                        <button class="btn btn-primary btn-small" onclick="openLogProgress('${goalId}')">+ Log Progress</button>
                    </div>
                    
                    <div class="progress-entries-list" style="margin-top: 20px;">
                        ${entriesWithComments.length === 0 ? '<div class="empty-state"><p>📝 No progress logged yet</p><p style="margin-top: 10px; font-size: 0.9rem;">Click "+ Log Progress" to add your first entry!</p></div>' : 
                        entriesWithComments.map(entry => {
                            const isOwner = entry.user_id === currentUser?.id;
                            return `
                                <div class="progress-entry">
                                    <div class="progress-entry-header">
                                        <div>
                                            <div class="progress-user">${escapeHtml(entry.userName)}</div>
                                            <div class="progress-date">${formatDate(entry.date)}</div>
                                        </div>
                                        ${isOwner ? `<button class="btn btn-danger btn-small" onclick="deleteProgressEntry('${entry.id}', '${goalId}')" title="Delete">🗑️</button>` : ''}
                                    </div>
                                    ${entry.notes ? `<div class="progress-notes">${escapeHtml(entry.notes)}</div>` : ''}
                                    
                                    <div class="comments-section">
                                        <div class="comments-list">
                                            ${entry.comments.map(comment => {
                                                const isCommentOwner = comment.user_id === currentUser?.id;
                                                const reactions = commentReactionCounts[comment.id] || { likes: 0, dislikes: 0 };
                                                const userReaction = userCommentReactions[comment.id];
                                                return `
                                                    <div class="comment">
                                                        <div class="comment-header">
                                                            <span class="comment-user">${escapeHtml(comment.userName)}</span>
                                                            <div>
                                                                <span class="comment-date">${formatDate(comment.created_at)}</span>
                                                                ${isCommentOwner ? `<button class="btn btn-danger btn-small" style="margin-left: 10px; padding: 4px 8px; font-size: 0.8rem;" onclick="deleteComment('${comment.id}', '${goalId}')" title="Delete">🗑️</button>` : ''}
                                                            </div>
                                                        </div>
                                                        <div class="comment-content">${escapeHtml(comment.content)}</div>
                                                        <div class="reaction-buttons">
                                                            <button class="reaction-btn like ${userReaction === 'like' ? 'active' : ''}" onclick="toggleReaction(null, '${comment.id}', 'like')">
                                                                <span>👍</span>
                                                                <span class="reaction-count">${reactions.likes}</span>
                                                            </button>
                                                            <button class="reaction-btn dislike ${userReaction === 'dislike' ? 'active' : ''}" onclick="toggleReaction(null, '${comment.id}', 'dislike')">
                                                                <span>👎</span>
                                                                <span class="reaction-count">${reactions.dislikes}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                        <div class="add-comment">
                                            <input type="text" placeholder="Add a comment..." id="comment-${entry.id}">
                                            <button class="btn btn-primary btn-small" onclick="addComment('${entry.id}')">Post</button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            
            document.getElementById('goalDetailsContent').innerHTML = content;
        } catch (error) {
            console.error('Error loading goal details:', error);
            document.getElementById('goalDetailsContent').innerHTML = `<div class="empty-state" style="color: var(--error);"><p>❌ Error loading goal details</p><p style="font-size: 0.9rem; margin-top: 10px;">${getErrorMessage(error)}</p></div>`;
        }
    }

    // Toggle reaction (like/dislike) for goals or comments
    window.toggleReaction = async (goalId, commentId, reactionType) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in to react', 'error');
            return;
        }
        
        try {
            // Check if user already has a reaction
            let query = supabase
                .from('reactions')
                .select('*')
                .eq('user_id', user.id);
            
            if (goalId) {
                query = query.eq('goal_id', goalId).is('comment_id', null);
            } else if (commentId) {
                query = query.eq('comment_id', commentId).is('goal_id', null);
            }
            
            const { data: existing } = await query;
            
            if (existing && existing.length > 0) {
                const existingReaction = existing[0];
                // If clicking the same reaction, remove it
                if (existingReaction.reaction_type === reactionType) {
                    const { error } = await supabase
                        .from('reactions')
                        .delete()
                        .eq('id', existingReaction.id);
                    
                    if (error) throw error;
                } else {
                    // Update to different reaction type
                    const { error } = await supabase
                        .from('reactions')
                        .update({ reaction_type: reactionType })
                        .eq('id', existingReaction.id);
                    
                    if (error) throw error;
                }
            } else {
                // Create new reaction
                const reactionData = {
                    user_id: user.id,
                    reaction_type: reactionType
                };
                
                if (goalId) {
                    reactionData.goal_id = goalId;
                } else if (commentId) {
                    reactionData.comment_id = commentId;
                }
                
                const { error } = await supabase
                    .from('reactions')
                    .insert([reactionData]);
                
                if (error) throw error;
            }
            
            // Reload the view
            if (goalId) {
                clearCache();
                await loadGoals(true);
            } else if (commentId && currentViewingGoalId) {
                await viewGoalDetails(currentViewingGoalId);
            }
        } catch (error) {
            console.error('Error toggling reaction:', error);
            showStatus(getErrorMessage(error), 'error');
        }
    };
    
    // Make functions global for onclick handlers
    window.viewGroup = viewGroup;
    window.viewGoalDetails = viewGoalDetails;
    
    // ========== GROUP CHAT ==========
    
    // Open group chat modal
    window.openGroupChat = async (groupId, groupName) => {
        currentGroupChatId = groupId;
        document.getElementById('groupChatTitle').textContent = `${groupName} - Chat`;
        openModal('groupChatModal');
        await loadGroupMessages(groupId);
        
        // Start polling for new messages
        if (groupChatPollInterval) {
            clearInterval(groupChatPollInterval);
        }
        groupChatPollInterval = setInterval(() => {
            if (currentGroupChatId === groupId) {
                loadGroupMessages(groupId);
            }
        }, 3000);
    };
    
    // Load group messages
    async function loadGroupMessages(groupId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            const { data: messages, error } = await supabase
                .from('group_messages')
                .select('*, sender:profiles!group_messages_sender_id_fkey(id, name, username)')
                .eq('group_id', groupId)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            
            const messagesList = document.getElementById('groupMessagesList');
            if (!messagesList) return;
            
            if (!messages || messages.length === 0) {
                messagesList.innerHTML = '<div class="empty-state"><p>No messages yet. Start the conversation!</p></div>';
                return;
            }
            
            messagesList.innerHTML = messages.map(msg => {
                const isOwn = msg.sender_id === user.id;
                const senderName = msg.sender?.name || msg.sender?.username || 'Unknown';
                const time = formatDate(msg.created_at) + ' ' + new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="message ${isOwn ? 'sent' : 'received'}">
                        ${!isOwn ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
                        <div class="message-bubble">${escapeHtml(msg.content)}</div>
                        <div class="message-time">${time}</div>
                    </div>
                `;
            }).join('');
            
            messagesList.scrollTop = messagesList.scrollHeight;
        } catch (error) {
            console.error('Error loading group messages:', error);
            const messagesList = document.getElementById('groupMessagesList');
            if (messagesList) {
                messagesList.innerHTML = '<div class="empty-state" style="color: var(--error);"><p>Error loading messages</p></div>';
            }
        }
    }
    
    // Send group message
    document.getElementById('sendGroupMessageBtn')?.addEventListener('click', async () => {
        await sendGroupMessage();
    });
    
    document.getElementById('groupMessageInput')?.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            await sendGroupMessage();
        }
    });
    
    async function sendGroupMessage() {
        if (!currentGroupChatId) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const input = document.getElementById('groupMessageInput');
        if (!input) return;
        const content = input.value.trim();
        
        if (!content) return;
        
        const sendBtn = document.getElementById('sendGroupMessageBtn');
        if (!sendBtn) return;
        const messagesList = document.getElementById('groupMessagesList');
        if (!messagesList) return;
        
        // Optimistically add message
        const tempId = 'temp_' + Date.now();
        const time = formatDate(new Date().toISOString()) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message sent';
        messageDiv.setAttribute('data-message-id', tempId);
        messageDiv.style.opacity = '0.7';
        messageDiv.innerHTML = `
            <div class="message-bubble">${escapeHtml(content)}</div>
            <div class="message-time">${time}</div>
        `;
        messagesList.appendChild(messageDiv);
        messagesList.scrollTop = messagesList.scrollHeight;
        
        input.value = '';
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
        
        try {
            const { data: newMessage, error } = await supabase
                .from('group_messages')
                .insert([{
                    group_id: currentGroupChatId,
                    sender_id: user.id,
                    content: content
                }])
                .select()
                .maybeSingle();
            
            if (error || !newMessage) {
                throw error || new Error('Failed to send message');
            }
            
            // Update with real message ID
            messageDiv.setAttribute('data-message-id', newMessage.id);
            messageDiv.style.opacity = '1';
            messageDiv.style.transition = 'opacity 0.3s';
        } catch (error) {
            console.error('Error sending group message:', error);
            messageDiv.remove();
            showStatus(getErrorMessage(error), 'error');
            input.value = content;
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
    }
    
    // Cleanup group chat polling when modal closes
    document.getElementById('groupChatModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'groupChatModal' || e.target.classList.contains('modal-close')) {
            if (groupChatPollInterval) {
                clearInterval(groupChatPollInterval);
                groupChatPollInterval = null;
            }
            currentGroupChatId = null;
        }
    });
    
    // ========== GROUP ANALYTICS ==========
    
    // Open group analytics modal
    window.openGroupAnalytics = async (groupId, groupName) => {
        document.getElementById('groupAnalyticsTitle').textContent = `${groupName} - Analytics`;
        openModal('groupAnalyticsModal');
        await loadGroupAnalytics(groupId);
    };
    
    // Load group analytics
    async function loadGroupAnalytics(groupId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const analyticsContent = document.getElementById('groupAnalyticsContent');
        if (!analyticsContent) return;
        
        analyticsContent.innerHTML = '<p class="loading">Loading analytics...</p>';
        
        try {
            // Get all group members
            const { data: members } = await supabase
                .from('group_members')
                .select('user_id, profiles(id, name, username)')
                .eq('group_id', groupId);
            
            if (!members || members.length === 0) {
                analyticsContent.innerHTML = '<div class="empty-state"><p>No members in this group</p></div>';
                return;
            }
            
            const memberIds = members.map(m => m.user_id);
            
            // Get all goals for this group
            const { data: goals } = await supabase
                .from('goals')
                .select('*')
                .eq('group_id', groupId)
                .eq('is_active', true);
            
            if (!goals || goals.length === 0) {
                analyticsContent.innerHTML = '<div class="empty-state"><p>No goals in this group yet</p></div>';
                return;
            }
            
            const goalIds = goals.map(g => g.id);
            
            // Get all progress entries for these goals
            const { data: progressEntries } = await supabase
                .from('progress_entries')
                .select('*, goals(title, target_days)')
                .in('goal_id', goalIds);
            
            // Calculate analytics per user
            const userStats = {};
            
            memberIds.forEach(memberId => {
                const member = members.find(m => m.user_id === memberId);
                const memberName = member?.profiles?.name || member?.profiles?.username || 'Unknown';
                userStats[memberId] = {
                    name: memberName,
                    totalGoals: goals.length,
                    goalsWithProgress: new Set(),
                    totalProgressEntries: 0,
                    progressByGoal: {},
                    completionRate: 0
                };
            });
            
            if (progressEntries) {
                progressEntries.forEach(entry => {
                    const userId = entry.user_id;
                    const goalId = entry.goal_id;
                    const goal = entry.goals;
                    
                    if (userStats[userId]) {
                        userStats[userId].goalsWithProgress.add(goalId);
                        userStats[userId].totalProgressEntries++;
                        
                        if (!userStats[userId].progressByGoal[goalId]) {
                            userStats[userId].progressByGoal[goalId] = {
                                title: goal?.title || 'Unknown',
                                targetDays: goal?.target_days || 30,
                                entries: 0
                            };
                        }
                        userStats[userId].progressByGoal[goalId].entries++;
                    }
                });
            }
            
            // Calculate completion rates
            Object.keys(userStats).forEach(userId => {
                const stats = userStats[userId];
                let totalCompletion = 0;
                Object.values(stats.progressByGoal).forEach(goalProgress => {
                    const completion = Math.min(100, (goalProgress.entries / goalProgress.targetDays) * 100);
                    totalCompletion += completion;
                });
                stats.completionRate = stats.totalGoals > 0 ? (totalCompletion / stats.totalGoals) : 0;
            });
            
            // Render analytics
            const statsArray = Object.values(userStats).sort((a, b) => b.totalProgressEntries - a.totalProgressEntries);
            
            analyticsContent.innerHTML = `
                <div style="margin-bottom: 30px;">
                    <h4 style="margin-bottom: 15px; color: var(--primary);">Group Overview</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                        <div class="card" style="padding: 15px;">
                            <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Total Members</div>
                            <div style="font-size: 1.8rem; font-weight: bold; color: var(--primary);">${memberIds.length}</div>
                        </div>
                        <div class="card" style="padding: 15px;">
                            <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Total Goals</div>
                            <div style="font-size: 1.8rem; font-weight: bold; color: var(--primary);">${goals.length}</div>
                        </div>
                        <div class="card" style="padding: 15px;">
                            <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Total Progress Entries</div>
                            <div style="font-size: 1.8rem; font-weight: bold; color: var(--primary);">${progressEntries?.length || 0}</div>
                        </div>
                    </div>
                </div>
                
                <div>
                    <h4 style="margin-bottom: 15px; color: var(--primary);">Member Progress</h4>
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        ${statsArray.map(stats => `
                            <div class="card" style="padding: 20px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                    <h5 style="margin: 0; color: var(--text);">${escapeHtml(stats.name)}</h5>
                                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--primary);">${stats.totalProgressEntries} entries</div>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                        <span style="font-size: 0.9rem; color: var(--text-light);">Overall Completion</span>
                                        <span style="font-size: 0.9rem; font-weight: bold;">${stats.completionRate.toFixed(1)}%</span>
                                    </div>
                                    <div style="width: 100%; height: 8px; background: var(--secondary); border-radius: 4px; overflow: hidden;">
                                        <div style="width: ${stats.completionRate}%; height: 100%; background: var(--primary); transition: width 0.3s;"></div>
                                    </div>
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-light);">
                                    Active in ${stats.goalsWithProgress.size} of ${stats.totalGoals} goals
                                </div>
                                ${Object.keys(stats.progressByGoal).length > 0 ? `
                                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                                        <div style="font-size: 0.9rem; font-weight: bold; margin-bottom: 10px; color: var(--text);">Goal Breakdown:</div>
                                        ${Object.values(stats.progressByGoal).map(goalProgress => {
                                            const goalCompletion = Math.min(100, (goalProgress.entries / goalProgress.targetDays) * 100);
                                            return `
                                                <div style="margin-bottom: 10px;">
                                                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                                        <span style="font-size: 0.85rem;">${escapeHtml(goalProgress.title)}</span>
                                                        <span style="font-size: 0.85rem; font-weight: bold;">${goalProgress.entries}/${goalProgress.targetDays}</span>
                                                    </div>
                                                    <div style="width: 100%; height: 6px; background: var(--secondary); border-radius: 3px; overflow: hidden;">
                                                        <div style="width: ${goalCompletion}%; height: 100%; background: var(--success); transition: width 0.3s;"></div>
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading group analytics:', error);
            analyticsContent.innerHTML = `<div class="empty-state" style="color: var(--error);"><p>Error loading analytics</p><p style="font-size: 0.9rem; margin-top: 10px;">${getErrorMessage(error)}</p></div>`;
        }
    }
    
    window.openLogProgress = (goalId) => {
        document.getElementById('progressGoalId').value = goalId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        document.getElementById('progressDate').valueAsDate = today;
        document.getElementById('progressDate').max = new Date().toISOString().split('T')[0]; // Prevent future dates
        closeModal('goalDetailsModal');
        openModal('logProgressModal');
    };
    
    // Prevent duplicate comment submissions
    const commentSubmitting = new Set();
    window.addComment = async (progressId) => {
        if (commentSubmitting.has(progressId)) {
            return; // Already submitting
        }
        
        const input = document.getElementById(`comment-${progressId}`);
        if (!input) return;
        
        const content = input.value.trim();
        if (!content) {
            showStatus('Please enter a comment', 'error');
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const submitBtn = input.nextElementSibling;
        if (!submitBtn) return;
        
        // Find comments list for this progress entry
        const commentsList = input.closest('.add-comment')?.previousElementSibling;
        if (!commentsList || !commentsList.classList.contains('comments-list')) {
            // Fallback to reload
            commentSubmitting.add(progressId);
            submitBtn.disabled = true;
            submitBtn.textContent = 'Posting...';
            try {
                const { error } = await supabase
                    .from('comments')
                    .insert([{
                        progress_id: progressId,
                        user_id: user.id,
                        content: content
                    }]);
                if (error) throw error;
                input.value = '';
                if (currentViewingGoalId) {
                    await viewGoalDetails(currentViewingGoalId);
                }
            } catch (error) {
                console.error('Error adding comment:', error);
                showStatus(getErrorMessage(error), 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Post';
                commentSubmitting.delete(progressId);
            }
            return;
        }
        
        // Get user name
        const { data: profile } = await supabase
            .from('profiles')
            .select('name, username')
            .eq('id', user.id)
            .maybeSingle();
        
        const userName = profile?.name || profile?.username || user.email?.split('@')[0] || 'You';
        
        // Optimistically add comment to UI
        const tempComment = document.createElement('div');
        tempComment.className = 'comment';
        tempComment.style.opacity = '0.7';
        tempComment.innerHTML = `
            <div class="comment-header">
                <span class="comment-user">${escapeHtml(userName)}</span>
                <div>
                    <span class="comment-date">just now</span>
                </div>
            </div>
            <div class="comment-content">${escapeHtml(content)}</div>
        `;
        commentsList.appendChild(tempComment);
        
        // Scroll to new comment
        tempComment.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        input.value = '';
        commentSubmitting.add(progressId);
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';
        
        try {
            const { data: newComment, error } = await supabase
                .from('comments')
                .insert([{
                    progress_id: progressId,
                    user_id: user.id,
                    content: content
                }])
                .select()
                .maybeSingle();
            
            if (error || !newComment) {
                throw error || new Error('Failed to add comment');
            }
            
            // Update with real comment data
            const realDate = formatDate(newComment.created_at);
            tempComment.setAttribute('data-comment-id', newComment.id);
            tempComment.style.opacity = '1';
            tempComment.style.transition = 'opacity 0.3s';
            tempComment.querySelector('.comment-date').textContent = realDate;
            
            // Add delete button if owner
            if (newComment.user_id === user.id) {
                const headerDiv = tempComment.querySelector('.comment-header > div');
                if (headerDiv) {
                    headerDiv.innerHTML = `
                        <span class="comment-date">${realDate}</span>
                        <button class="btn btn-danger btn-small" style="margin-left: 10px; padding: 4px 8px; font-size: 0.8rem;" onclick="deleteComment('${newComment.id}', '${currentViewingGoalId}')" title="Delete">🗑️</button>
                    `;
                }
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            tempComment.remove();
            showStatus(getErrorMessage(error), 'error');
            input.value = content; // Restore comment
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
            commentSubmitting.delete(progressId);
        }
    };

    // Delete comment
    window.deleteComment = async (commentId, goalId) => {
        if (!confirm('Are you sure you want to delete this comment?')) {
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId)
                .eq('user_id', user.id);
            
            if (error) throw error;
            
            showStatus('Comment deleted successfully', 'success');
            if (goalId) {
                await viewGoalDetails(goalId);
            }
        } catch (error) {
            console.error('Error deleting comment:', error);
            showStatus(getErrorMessage(error), 'error');
        }
    };

    // Delete progress entry - with smooth removal
    window.deleteProgressEntry = async (entryId, goalId) => {
        if (!confirm('Are you sure you want to delete this progress entry? This will also delete all comments on this entry.')) {
            return;
        }
        
        const entryEl = document.querySelector(`[data-entry-id="${entryId}"]`) ||
                       document.querySelector(`.progress-entry:has(button[onclick*="deleteProgressEntry('${entryId}'"])`);
        
        // Optimistically remove from UI
        if (entryEl) {
            entryEl.style.transition = 'opacity 0.3s, transform 0.3s, max-height 0.3s, margin 0.3s';
            entryEl.style.opacity = '0';
            entryEl.style.transform = 'translateX(-20px)';
            entryEl.style.maxHeight = entryEl.offsetHeight + 'px';
            setTimeout(() => {
                entryEl.style.maxHeight = '0';
                entryEl.style.margin = '0';
                setTimeout(() => entryEl.remove(), 300);
            }, 10);
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            const { error } = await supabase
                .from('progress_entries')
                .delete()
                .eq('id', entryId)
                .eq('user_id', user.id);
            
            if (error) throw error;
            
            showStatus('Progress entry deleted successfully', 'success');
            clearCache();
            // Only reload if needed (for progress counts)
            loadGoals(true);
            loadProgress(true);
        } catch (error) {
            console.error('Error deleting progress entry:', error);
            showStatus(getErrorMessage(error), 'error');
            // Reload on error
            if (goalId) {
                await viewGoalDetails(goalId);
            }
        }
    };

    // Log progress with duplicate and future date validation
    document.getElementById('logProgressForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const goalId = document.getElementById('progressGoalId').value;
        const date = document.getElementById('progressDate').value;
        const notes = document.getElementById('progressNotes').value.trim();
        
        // Validation
        if (!goalId) {
            showStatus('Please select a goal', 'error');
            return;
        }
        
        if (!date) {
            showStatus('Please select a date', 'error');
            return;
        }
        
        // Check for future dates
        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        
        if (selectedDate > today) {
            showStatus('Cannot log progress for future dates. Please select today or a past date.', 'error');
            return;
        }
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging...';
        
        try {
            // Check for duplicate entry (same goal, user, and date)
            const { data: existing } = await supabase
                .from('progress_entries')
                .select('id')
                .eq('goal_id', goalId)
                .eq('user_id', user.id)
                .eq('date', date)
                .maybeSingle();
            
            if (existing) {
                showStatus('You have already logged progress for this goal on this date. Please select a different date.', 'error');
                return;
            }
            
            const { error } = await supabase
                .from('progress_entries')
                .insert([{
                    goal_id: goalId,
                    user_id: user.id,
                    date: date,
                    notes: notes
                }]);
            
            if (error) throw error;
            
            showStatus('Progress logged successfully!', 'success');
            closeModal('logProgressModal');
            document.getElementById('logProgressForm').reset();
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            document.getElementById('progressDate').valueAsDate = todayDate;
            clearCache();
            loadGoals(true);
            loadProgress(true);
            
            // Reload goal details if modal was open
            if (currentViewingGoalId === goalId) {
                await viewGoalDetails(goalId);
            }
        } catch (error) {
            console.error('Error logging progress:', error);
            showStatus(getErrorMessage(error), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log Progress';
        }
    });

    // ========== PROGRESS ==========

    // Load progress
    async function loadProgress(forceRefresh = false) {
        const progressList = document.getElementById('progressList');
        showLoading('progressList', 'Loading progress...');
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            // Get user's groups (optimized)
            const { data: memberships } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            const groupIds = memberships ? memberships.map(m => m.group_id) : [];
            
            // Get goals user can see (optimized)
            let goalsQuery = supabase
                .from('goals')
                .select('id');
            
            if (groupIds.length > 0) {
                goalsQuery = goalsQuery.or(`user_id.eq.${user.id},group_id.in.(${groupIds.join(',')})`);
            } else {
                goalsQuery = goalsQuery.eq('user_id', user.id);
            }
            
            const { data: goals } = await goalsQuery;
            
            const goalIds = goals ? goals.map(g => g.id) : [];
            
            if (goalIds.length === 0) {
                progressList.innerHTML = '<div class="empty-state"><p>📊 No progress entries yet</p><p style="margin-top: 10px; font-size: 0.9rem;">Create a goal and log your first progress entry!</p></div>';
                return;
            }
            
            // Get recent progress entries
            const { data: entries } = await supabase
                .from('progress_entries')
                .select('*, goals(title)')
                .in('goal_id', goalIds)
                .order('date', { ascending: false })
                .limit(20);
            
            // Get unique user IDs
            const userIds = [...new Set((entries || []).map(e => e.user_id))];
            
            // Get user profiles
            const { data: profiles } = userIds.length > 0 ? await supabase
                .from('profiles')
                .select('id, name, email')
                .in('id', userIds) : { data: [] };
            
            // Create a map for quick lookup
            const userMap = {};
            if (profiles) {
                profiles.forEach(p => {
                    userMap[p.id] = p.name || p.email || 'Unknown';
                });
            }
            
            // Get user info for entries
            const entriesWithUsers = (entries || []).map(entry => {
                return { ...entry, userName: userMap[entry.user_id] || 'Unknown' };
            });
            
            displayProgress(entriesWithUsers);
        } catch (error) {
            console.error('Error loading progress:', error);
            progressList.innerHTML = `<div class="empty-state" style="color: var(--error);"><p>❌ Error loading progress</p><p style="font-size: 0.9rem; margin-top: 10px;">${getErrorMessage(error)}</p></div>`;
        }
    }

    // Display progress
    function displayProgress(entries) {
        const progressList = document.getElementById('progressList');
        
        if (entries.length === 0) {
            progressList.innerHTML = '<div class="empty-state"><p>📊 No progress entries yet</p><p style="margin-top: 10px; font-size: 0.9rem;">Create a goal and log your first progress entry!</p></div>';
            return;
        }
        
        progressList.innerHTML = entries.map(entry => `
            <div class="card" onclick="viewGoalDetails('${entry.goal_id}')">
                <div class="card-header">
                    <div>
                        <div class="card-title">${escapeHtml(entry.goals?.title || 'Unknown Goal')}</div>
                        <div class="card-subtitle">${escapeHtml(entry.userName)} • ${formatDate(entry.date)}</div>
                    </div>
                </div>
                ${entry.notes ? `<div class="card-content">${escapeHtml(entry.notes)}</div>` : ''}
            </div>
        `).join('');
    }

    // Utility functions
    function formatDate(dateString) {
        if (!dateString) return 'No date';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize date inputs with max date (today)
    const progressDate = document.getElementById('progressDate');
    if (progressDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        progressDate.valueAsDate = today;
        progressDate.max = new Date().toISOString().split('T')[0]; // Prevent future dates
    }

    // ========== DASHBOARD SIDEBAR ==========
    
    // Dashboard tab switching
    const dashboardTabs = document.querySelectorAll('.dashboard-tab');
    dashboardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const dashboardId = tab.getAttribute('data-dashboard');
            
            // Remove active from all tabs and panels
            document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.dashboard-panel').forEach(p => p.classList.remove('active'));
            
            // Add active to clicked tab and corresponding panel
            tab.classList.add('active');
            const panel = document.getElementById(dashboardId);
            if (panel) {
                panel.classList.add('active');
            }
            
            // Load data for the dashboard panel
            if (dashboardId === 'friendsDashboard') {
                loadSidebarFriends();
            } else if (dashboardId === 'groupsDashboard') {
                loadSidebarGroups();
            } else if (dashboardId === 'goalsDashboard') {
                loadSidebarGoals();
            }
        });
    });
    
    // Sidebar add friend button
    document.getElementById('sidebarAddFriendBtn')?.addEventListener('click', () => {
        openModal('addFriendModal');
    });
    
    // Sidebar friend requests button
    document.getElementById('sidebarFriendRequestsBtn')?.addEventListener('click', async () => {
        openModal('friendRequestsModal');
        await loadFriendRequests();
    });
    
    // Update friend requests badge
    async function updateFriendRequestsBadge() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            const { data: requests } = await supabase
                .from('friend_requests')
                .select('id')
                .eq('receiver_id', user.id)
                .eq('status', 'pending');
            
            const badge = document.getElementById('friendRequestsBadge');
            if (badge) {
                const count = requests?.length || 0;
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error updating friend requests badge:', error);
        }
    }
    
    // Update badge periodically
    setInterval(updateFriendRequestsBadge, 10000); // Every 10 seconds
    
    // Load sidebar friends
    async function loadSidebarFriends() {
        const friendsList = document.getElementById('sidebarFriendsList');
        if (!friendsList) return;
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const { data: friendships } = await supabase
                .from('friendships')
                .select('*')
                .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
            
            if (!friendships || friendships.length === 0) {
                friendsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-light); font-size: 0.85rem;">No friends yet</div>';
                return;
            }
            
            const friendIds = friendships.map(f => 
                f.user1_id === user.id ? f.user2_id : f.user1_id
            );
            
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, username, last_seen')
                .in('id', friendIds);
            
            // Check unread messages
            const { data: unreadMessages } = await supabase
                .from('messages')
                .select('sender_id')
                .eq('receiver_id', user.id)
                .eq('is_read', false);
            
            const unreadCounts = {};
            if (unreadMessages) {
                unreadMessages.forEach(msg => {
                    unreadCounts[msg.sender_id] = (unreadCounts[msg.sender_id] || 0) + 1;
                });
            }
            
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            
            if (!profiles || profiles.length === 0) {
                friendsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-light); font-size: 0.85rem;">No friends yet</div>';
                return;
            }
            
            friendsList.innerHTML = profiles.map(profile => {
                const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date(0);
                const isOnline = !isNaN(lastSeen.getTime()) && lastSeen > fiveMinutesAgo;
                const displayName = profile.name || profile.username || 'Unknown';
                const initials = displayName.substring(0, 2).toUpperCase();
                const unreadCount = unreadCounts[profile.id] || 0;
                
                return `
                    <div class="dashboard-friend-item" onclick="openMessageModal('${profile.id}', '${escapeHtml(displayName)}')">
                        <div class="dashboard-friend-avatar">${initials}</div>
                        <div class="dashboard-friend-info">
                            <div class="dashboard-friend-name">${escapeHtml(displayName)}${unreadCount > 0 ? ` <span class="unread-badge" style="font-size: 0.7rem; padding: 1px 6px;">${unreadCount}</span>` : ''}</div>
                            <div class="dashboard-friend-status">
                                <span class="dashboard-status-indicator ${isOnline ? 'online' : 'offline'}"></span>
                                ${isOnline ? 'Online' : 'Offline'}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading sidebar friends:', error);
            friendsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--error); font-size: 0.85rem;">Error loading friends</div>';
        }
    }
    
    // Load sidebar groups
    async function loadSidebarGroups() {
        const groupsList = document.getElementById('sidebarGroupsList');
        if (!groupsList) return;
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const { data: memberships } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            if (!memberships || memberships.length === 0) {
                groupsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-light); font-size: 0.85rem;">No groups yet</div>';
                return;
            }
            
            const groupIds = memberships.map(m => m.group_id);
            
            const { data: groups } = await supabase
                .from('groups')
                .select('*')
                .in('id', groupIds)
                .order('created_at', { ascending: false });
            
            if (!groups || groups.length === 0) {
                groupsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-light); font-size: 0.85rem;">No groups yet</div>';
                return;
            }
            
            groupsList.innerHTML = groups.map(group => {
                return `
                    <div class="dashboard-group-item" onclick="viewGroup('${group.id}'); switchTab('goalsTab');">
                        <div class="dashboard-group-name">${escapeHtml(group.name)}</div>
                        <div class="dashboard-group-subtitle">Code: ${escapeHtml(group.code)}</div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading sidebar groups:', error);
            groupsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--error); font-size: 0.85rem;">Error loading groups</div>';
        }
    }
    
    // Load sidebar goals
    async function loadSidebarGoals() {
        const goalsList = document.getElementById('sidebarGoalsList');
        if (!goalsList) return;
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const { data: memberships } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            const groupIds = memberships ? memberships.map(m => m.group_id) : [];
            
            let query = supabase
                .from('goals')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            
            if (groupIds.length > 0) {
                query = query.or(`user_id.eq.${user.id},group_id.in.(${groupIds.join(',')})`);
            } else {
                query = query.eq('user_id', user.id);
            }
            
            const { data: goals } = await query;
            
            if (!goals || goals.length === 0) {
                goalsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-light); font-size: 0.85rem;">No goals yet</div>';
                return;
            }
            
            // Get progress counts
            const goalIds = goals.map(g => g.id);
            const { data: progressEntries } = await supabase
                .from('progress_entries')
                .select('goal_id')
                .in('goal_id', goalIds);
            
            const progressCounts = {};
            if (progressEntries) {
                progressEntries.forEach(entry => {
                    progressCounts[entry.goal_id] = (progressCounts[entry.goal_id] || 0) + 1;
                });
            }
            
            goalsList.innerHTML = goals.map(goal => {
                const progressCount = progressCounts[goal.id] || 0;
                return `
                    <div class="dashboard-goal-item" onclick="viewGoalDetails('${goal.id}')">
                        <div class="dashboard-goal-name">${escapeHtml(goal.title)}</div>
                        <div class="dashboard-goal-subtitle">${progressCount}/${goal.target_days} days • ${goal.frequency}</div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading sidebar goals:', error);
            goalsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--error); font-size: 0.85rem;">Error loading goals</div>';
        }
    }
    
    // Refresh sidebar when main data loads (called after functions are defined)
    // This will be called from the respective load functions

    // ========== FRIENDS ==========
    
    let currentMessagingFriendId = null;
    let messagePollInterval = null;
    
    // Load friends list
    async function loadFriends() {
        const friendsList = document.getElementById('friendsList');
        if (!friendsList) return;
        showLoading('friendsList', 'Loading friends...');
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            // Get all friendships where user is involved
            const { data: friendships, error } = await supabase
                .from('friendships')
                .select('*')
                .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
            
            if (error) throw error;
            
            if (!friendships || friendships.length === 0) {
                friendsList.innerHTML = '<div class="empty-state"><p>👥 No friends yet.</p><p style="margin-top: 10px; font-size: 0.9rem;">Add friends to start messaging!</p></div>';
                return;
            }
            
            // Get friend user IDs
            const friendIds = friendships.map(f => 
                f.user1_id === user.id ? f.user2_id : f.user1_id
            );
            
            // Get friend profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, username, last_seen')
                .in('id', friendIds);
            
            // Check for unread messages
            const { data: unreadMessages } = await supabase
                .from('messages')
                .select('sender_id, receiver_id')
                .eq('receiver_id', user.id)
                .eq('is_read', false);
            
            const unreadCounts = {};
            if (unreadMessages) {
                unreadMessages.forEach(msg => {
                    unreadCounts[msg.sender_id] = (unreadCounts[msg.sender_id] || 0) + 1;
                });
            }
            
            // Determine online status (online if last_seen within last 5 minutes)
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            
            if (!profiles || profiles.length === 0) {
                friendsList.innerHTML = '<div class="empty-state"><p>👥 No friends yet.</p><p style="margin-top: 10px; font-size: 0.9rem;">Add friends to start messaging!</p></div>';
                return;
            }
            
            friendsList.innerHTML = profiles.map(profile => {
                const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date(0);
                const isOnline = !isNaN(lastSeen.getTime()) && lastSeen > fiveMinutesAgo;
                const unreadCount = unreadCounts[profile.id] || 0;
                const displayName = profile.name || profile.username || 'Unknown';
                const initials = displayName.substring(0, 2).toUpperCase();
                
                return `
                    <div class="friend-card">
                        <div class="friend-info" onclick="openMessageModal('${profile.id}', '${escapeHtml(displayName)}')" style="cursor: pointer;">
                            <div class="friend-avatar">${initials}</div>
                            <div class="friend-details">
                                <div class="friend-name">${escapeHtml(displayName)}</div>
                                <div class="friend-status">
                                    <span class="status-indicator ${isOnline ? 'online' : 'offline'}"></span>
                                    ${isOnline ? 'Online' : `Last seen ${formatRelativeTime(lastSeen)}`}
                                    ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="friend-actions">
                            <button class="btn btn-primary btn-small" onclick="openMessageModal('${profile.id}', '${escapeHtml(displayName)}')">Message</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading friends:', error);
            friendsList.innerHTML = `<div class="empty-state" style="color: var(--error);"><p>❌ Error loading friends</p><p style="font-size: 0.9rem; margin-top: 10px;">${getErrorMessage(error)}</p></div>`;
        }
    }
    
    // Format relative time
    function formatRelativeTime(date) {
        if (!date) return 'unknown';
        const now = new Date();
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) return 'unknown';
        
        const diff = now - dateObj;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return formatDate(dateObj.toISOString());
    }
    
    // Add friend button
    document.getElementById('addFriendBtn')?.addEventListener('click', () => {
        openModal('addFriendModal');
    });
    
    // Friend requests button
    document.getElementById('friendRequestsBtn')?.addEventListener('click', async () => {
        openModal('friendRequestsModal');
        await loadFriendRequests();
    });
    
    // Send friend request
    document.getElementById('addFriendForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const username = document.getElementById('friendUsername').value.trim();
        
        if (!username) {
            showStatus('Please enter a username', 'error');
            return;
        }
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        
        try {
            // Find user by username
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username)
                .maybeSingle();
            
            if (profileError || !profile) {
                showStatus('User not found', 'error');
                return;
            }
            
            if (profile.id === user.id) {
                showStatus('You cannot add yourself as a friend', 'error');
                return;
            }
            
            // Check if already friends
            const user1Id = user.id < profile.id ? user.id : profile.id;
            const user2Id = user.id < profile.id ? profile.id : user.id;
            const { data: existingFriendship } = await supabase
                .from('friendships')
                .select('*')
                .eq('user1_id', user1Id)
                .eq('user2_id', user2Id)
                .maybeSingle();
            
            if (existingFriendship) {
                showStatus('You are already friends with this user', 'error');
                return;
            }
            
            // Check if request already exists
            const { data: existingRequests } = await supabase
                .from('friend_requests')
                .select('*')
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${user.id})`)
                .eq('status', 'pending');
            
            if (existingRequests && existingRequests.length > 0) {
                showStatus('Friend request already exists', 'error');
                return;
            }
            
            // Create friend request
            const { error } = await supabase
                .from('friend_requests')
                .insert([{
                    sender_id: user.id,
                    receiver_id: profile.id,
                    status: 'pending'
                }]);
            
            if (error) throw error;
            
            showStatus('Friend request sent!', 'success');
            closeModal('addFriendModal');
            document.getElementById('addFriendForm').reset();
            // Update badge (for the receiver)
            await updateFriendRequestsBadge();
        } catch (error) {
            console.error('Error sending friend request:', error);
            showStatus(getErrorMessage(error), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Friend Request';
        }
    });
    
    // Load friend requests
    async function loadFriendRequests() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            const { data: requests, error } = await supabase
                .from('friend_requests')
                .select('*')
                .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            const requestsList = document.getElementById('friendRequestsList');
            if (!requestsList) return;
            
            if (!requests || requests.length === 0) {
                requestsList.innerHTML = '<div class="empty-state"><p>No pending friend requests</p></div>';
                return;
            }
            
            // Get user IDs
            const userIds = [...new Set(requests.flatMap(r => [r.sender_id, r.receiver_id]))];
            
            // Get profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, username')
                .in('id', userIds);
            
            const profileMap = {};
            if (profiles) {
                profiles.forEach(p => {
                    profileMap[p.id] = p;
                });
            }
            
            // Update badge
            await updateFriendRequestsBadge();
            
            requestsList.innerHTML = requests.map(request => {
                const isReceiver = request.receiver_id === user.id;
                const otherUserId = isReceiver ? request.sender_id : request.receiver_id;
                const otherUser = profileMap[otherUserId];
                const displayName = otherUser?.name || otherUser?.username || 'Unknown';
                
                if (isReceiver) {
                    // Incoming request
                    return `
                        <div class="friend-request-card">
                            <div class="friend-request-info">
                                <div class="friend-request-name">${escapeHtml(displayName)}</div>
                                <div class="friend-request-date">Sent ${formatRelativeTime(new Date(request.created_at))}</div>
                            </div>
                            <div class="friend-request-actions">
                                <button class="btn btn-primary btn-small" onclick="handleFriendRequest('${request.id}', 'accept')">Accept</button>
                                <button class="btn btn-secondary btn-small" onclick="handleFriendRequest('${request.id}', 'reject')">Reject</button>
                            </div>
                        </div>
                    `;
                } else {
                    // Outgoing request
                    return `
                        <div class="friend-request-card">
                            <div class="friend-request-info">
                                <div class="friend-request-name">${escapeHtml(displayName)}</div>
                                <div class="friend-request-date">Sent ${formatRelativeTime(new Date(request.created_at))}</div>
                            </div>
                            <div class="friend-request-actions">
                                <span style="color: var(--text-light); font-size: 0.9rem;">Pending</span>
                                <button class="btn btn-secondary btn-small" onclick="handleFriendRequest('${request.id}', 'cancel')">Cancel</button>
                            </div>
                        </div>
                    `;
                }
            }).join('');
        } catch (error) {
            console.error('Error loading friend requests:', error);
            const requestsList = document.getElementById('friendRequestsList');
            if (requestsList) {
                requestsList.innerHTML = `<div class="empty-state" style="color: var(--error);"><p>Error loading requests</p></div>`;
            }
        }
    }
    
    // Handle friend request (accept/reject/cancel) - with smooth UI updates
    window.handleFriendRequest = async (requestId, action) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        // Find the request card element for smooth removal
        const requestCard = document.querySelector(`button[onclick*="handleFriendRequest('${requestId}'"]`)?.closest('.friend-request-card') ||
                          document.querySelector(`.friend-request-card:has(button[onclick*="handleFriendRequest('${requestId}'"])`);
        
        try {
            if (action === 'cancel') {
                // Optimistically remove from UI
                if (requestCard) {
                    requestCard.style.transition = 'opacity 0.3s, transform 0.3s';
                    requestCard.style.opacity = '0';
                    requestCard.style.transform = 'translateX(-20px)';
                    setTimeout(() => requestCard.remove(), 300);
                }
                
                // Delete the request
                const { error } = await supabase
                    .from('friend_requests')
                    .delete()
                    .eq('id', requestId)
                    .eq('sender_id', user.id);
                
                if (error) throw error;
                showStatus('Friend request cancelled', 'success');
                await updateFriendRequestsBadge();
            } else {
                // Get the request
                const { data: request, error: fetchError } = await supabase
                    .from('friend_requests')
                    .select('*, sender:profiles!friend_requests_sender_id_fkey(id, name, username), receiver:profiles!friend_requests_receiver_id_fkey(id, name, username)')
                    .eq('id', requestId)
                    .single();
                
                if (fetchError) {
                    // Try without foreign key relation
                    const { data: simpleRequest, error: simpleError } = await supabase
                        .from('friend_requests')
                        .select('*')
                        .eq('id', requestId)
                        .maybeSingle();
                    
                    if (simpleError || !simpleRequest) {
                        throw fetchError || simpleError || new Error('Request not found');
                    }
                    
                    // Get profiles separately
                    const userIds = [simpleRequest.sender_id, simpleRequest.receiver_id];
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, name, username')
                        .in('id', userIds);
                    
                    const profileMap = {};
                    if (profiles) {
                        profiles.forEach(p => {
                            profileMap[p.id] = p;
                        });
                    }
                    
                    request = {
                        ...simpleRequest,
                        sender: profileMap[simpleRequest.sender_id],
                        receiver: profileMap[simpleRequest.receiver_id]
                    };
                }
                
                if (action === 'accept') {
                    // Optimistically remove request and add friend
                    if (requestCard) {
                        requestCard.style.transition = 'opacity 0.3s, transform 0.3s';
                        requestCard.style.opacity = '0';
                        requestCard.style.transform = 'translateX(-20px)';
                        setTimeout(() => requestCard.remove(), 300);
                    }
                    
                    // Update request status
                    const { error: updateError } = await supabase
                        .from('friend_requests')
                        .update({ status: 'accepted' })
                        .eq('id', requestId);
                    
                    if (updateError) throw updateError;
                    
                    // Create friendship
                    const user1Id = request.sender_id < request.receiver_id ? request.sender_id : request.receiver_id;
                    const user2Id = request.sender_id < request.receiver_id ? request.receiver_id : request.sender_id;
                    
                    const { error: friendError } = await supabase
                        .from('friendships')
                        .insert([{
                            user1_id: user1Id,
                            user2_id: user2Id
                        }]);
                    
                    if (friendError) throw friendError;
                    
                    // Add friend to lists smoothly
                    const otherUser = request.receiver_id === user.id ? request.sender : request.receiver;
                    if (otherUser) {
                        addFriendToList(otherUser.id, otherUser.name || otherUser.username || 'Unknown');
                        addFriendToSidebar(otherUser.id, otherUser.name || otherUser.username || 'Unknown');
                    }
                    
                    showStatus('Friend request accepted!', 'success');
                } else if (action === 'reject') {
                    // Optimistically remove from UI
                    if (requestCard) {
                        requestCard.style.transition = 'opacity 0.3s, transform 0.3s';
                        requestCard.style.opacity = '0';
                        requestCard.style.transform = 'translateX(-20px)';
                        setTimeout(() => requestCard.remove(), 300);
                    }
                    
                    const { error } = await supabase
                        .from('friend_requests')
                        .update({ status: 'rejected' })
                        .eq('id', requestId);
                    
                    if (error) throw error;
                    showStatus('Friend request rejected', 'success');
                }
                
                await updateFriendRequestsBadge();
            }
        } catch (error) {
            console.error('Error handling friend request:', error);
            showStatus(getErrorMessage(error), 'error');
            // Reload on error as fallback
            await loadFriendRequests();
            await loadFriends();
        }
    };
    
    // Add friend to main friends list smoothly
    function addFriendToList(friendId, friendName) {
        const friendsList = document.getElementById('friendsList');
        if (!friendsList || friendsList.querySelector(`[data-friend-id="${friendId}"]`)) return;
        
        const initials = friendName.substring(0, 2).toUpperCase();
        const friendCard = document.createElement('div');
        friendCard.className = 'friend-card';
        friendCard.setAttribute('data-friend-id', friendId);
        friendCard.style.opacity = '0';
        friendCard.style.transform = 'translateY(-10px)';
        friendCard.innerHTML = `
            <div class="friend-info" onclick="openMessageModal('${friendId}', '${escapeHtml(friendName)}')" style="cursor: pointer;">
                <div class="friend-avatar">${initials}</div>
                <div class="friend-details">
                    <div class="friend-name">${escapeHtml(friendName)}</div>
                    <div class="friend-status">
                        <span class="status-indicator offline"></span>
                        Offline
                    </div>
                </div>
            </div>
            <div class="friend-actions">
                <button class="btn btn-primary btn-small" onclick="openMessageModal('${friendId}', '${escapeHtml(friendName)}')">Message</button>
            </div>
        `;
        
        if (friendsList.querySelector('.empty-state')) {
            friendsList.innerHTML = '';
        }
        friendsList.insertBefore(friendCard, friendsList.firstChild);
        
        // Animate in
        setTimeout(() => {
            friendCard.style.transition = 'opacity 0.3s, transform 0.3s';
            friendCard.style.opacity = '1';
            friendCard.style.transform = 'translateY(0)';
        }, 10);
    }
    
    // Add friend to sidebar smoothly
    function addFriendToSidebar(friendId, friendName) {
        const sidebarList = document.getElementById('sidebarFriendsList');
        if (!sidebarList || sidebarList.querySelector(`[data-friend-id="${friendId}"]`)) return;
        
        const initials = friendName.substring(0, 2).toUpperCase();
        const friendItem = document.createElement('div');
        friendItem.className = 'dashboard-friend-item';
        friendItem.setAttribute('data-friend-id', friendId);
        friendItem.style.opacity = '0';
        friendItem.style.transform = 'translateX(-10px)';
        friendItem.onclick = () => openMessageModal(friendId, friendName);
        friendItem.innerHTML = `
            <div class="dashboard-friend-avatar">${initials}</div>
            <div class="dashboard-friend-info">
                <div class="dashboard-friend-name">${escapeHtml(friendName)}</div>
                <div class="dashboard-friend-status">
                    <span class="dashboard-status-indicator offline"></span>
                    Offline
                </div>
            </div>
        `;
        
        if (sidebarList.querySelector('.empty-state')) {
            sidebarList.innerHTML = '';
        }
        sidebarList.insertBefore(friendItem, sidebarList.firstChild);
        
        // Animate in
        setTimeout(() => {
            friendItem.style.transition = 'opacity 0.3s, transform 0.3s';
            friendItem.style.opacity = '1';
            friendItem.style.transform = 'translateX(0)';
        }, 10);
    }
    
    // Open message modal
    window.openMessageModal = async (friendId, friendName) => {
        currentMessagingFriendId = friendId;
        document.getElementById('messageModalTitle').textContent = `Messages with ${friendName}`;
        openModal('messageModal');
        await loadMessages(friendId);
        
        // Start polling for new messages
        if (messagePollInterval) {
            clearInterval(messagePollInterval);
        }
        messagePollInterval = setInterval(() => {
            if (currentMessagingFriendId === friendId) {
                loadMessages(friendId);
            }
        }, 3000); // Poll every 3 seconds
    };
    
    // Load messages
    async function loadMessages(friendId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            // Get messages
            const { data: messages, error } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
                .order('created_at', { ascending: true })
                .limit(50);
            
            if (error) throw error;
            
            // Mark messages as read
            await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('receiver_id', user.id)
                .eq('sender_id', friendId)
                .eq('is_read', false);
            
            const messagesList = document.getElementById('messagesList');
            if (!messagesList) return;
            
            if (!messages || messages.length === 0) {
                messagesList.innerHTML = '<div class="empty-state"><p>No messages yet. Start the conversation!</p></div>';
                return;
            }
            
            messagesList.innerHTML = messages.map(msg => {
                const isSent = msg.sender_id === user.id;
                const time = formatDate(msg.created_at) + ' ' + new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="message ${isSent ? 'sent' : 'received'}">
                        <div class="message-bubble">${escapeHtml(msg.content)}</div>
                        <div class="message-time">${time}</div>
                    </div>
                `;
            }).join('');
            
            // Scroll to bottom
            messagesList.scrollTop = messagesList.scrollHeight;
            
            // Reload friends to update unread counts
            if (document.getElementById('friendsTab')?.classList.contains('active')) {
                loadFriends();
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            const messagesList = document.getElementById('messagesList');
            if (messagesList) {
                messagesList.innerHTML = '<div class="empty-state" style="color: var(--error);"><p>Error loading messages</p></div>';
            }
        }
    }
    
    // Send message
    document.getElementById('sendMessageBtn')?.addEventListener('click', async () => {
        await sendMessage();
    });
    
    document.getElementById('messageInput')?.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            await sendMessage();
        }
    });
    
    async function sendMessage() {
        if (!currentMessagingFriendId) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const input = document.getElementById('messageInput');
        if (!input) return;
        const content = input.value.trim();
        
        if (!content) return;
        
        const sendBtn = document.getElementById('sendMessageBtn');
        if (!sendBtn) return;
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;
        
        // Optimistically add message to UI
        const tempId = 'temp_' + Date.now();
        const time = formatDate(new Date().toISOString()) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message sent';
        messageDiv.setAttribute('data-message-id', tempId);
        messageDiv.style.opacity = '0.7';
        messageDiv.innerHTML = `
            <div class="message-bubble">${escapeHtml(content)}</div>
            <div class="message-time">${time}</div>
        `;
        messagesList.appendChild(messageDiv);
        messagesList.scrollTop = messagesList.scrollHeight;
        
        input.value = '';
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
        
        try {
            const { data: newMessage, error } = await supabase
                .from('messages')
                .insert([{
                    sender_id: user.id,
                    receiver_id: currentMessagingFriendId,
                    content: content
                }])
                .select()
                .maybeSingle();
            
            if (error || !newMessage) {
                throw error || new Error('Failed to send message');
            }
            
            // Update with real message ID and full opacity
            messageDiv.setAttribute('data-message-id', newMessage.id);
            messageDiv.style.opacity = '1';
            messageDiv.style.transition = 'opacity 0.3s';
            
            // Update unread counts in friends list
            if (document.getElementById('friendsTab')?.classList.contains('active')) {
                loadFriends();
            }
            if (document.getElementById('friendsDashboard')?.classList.contains('active')) {
                loadSidebarFriends();
            }
        } catch (error) {
            console.error('Error sending message:', error);
            messageDiv.remove();
            showStatus(getErrorMessage(error), 'error');
            input.value = content; // Restore message
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
    }
}
