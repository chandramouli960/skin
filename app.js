// Wait for Supabase to be initialized
let supabase;
let currentUser = null;
let userGroups = [];
let userGoals = [];
let currentViewingGoalId = null; // Store goalId for comment reload
let groupsCache = null;
let goalsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30000; // 30 seconds

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
        }
    }

    // Close modals when clicking outside, close button, or Escape key
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
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

    // Tab navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    function switchTab(tabId) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Show selected tab
        document.getElementById(tabId).classList.add('active');
        
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        
        // Load data for the tab
        if (tabId === 'groupsTab') {
            loadGroups();
        } else if (tabId === 'goalsTab') {
            loadGoals();
        } else if (tabId === 'progressTab') {
            loadProgress();
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

    // Handle logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            showStatus('Logged out successfully', 'success');
            clearCache();
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
                        ${!isOwner ? `<button class="btn btn-danger btn-small" onclick="leaveGroup('${group.id}')" title="Leave Group">Leave</button>` : ''}
                    </div>
                    <div class="card-content" onclick="viewGroup('${group.id}')" style="cursor: pointer;">${escapeHtml(group.description || 'No description')}</div>
                    <div class="card-footer">
                        <span>Created ${formatDate(group.created_at)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Create group with unique code generation
    document.getElementById('createGroupBtn')?.addEventListener('click', () => {
        openModal('createGroupModal');
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
                    .single();
                
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

    // Join group
    document.getElementById('joinGroupBtn')?.addEventListener('click', () => {
        openModal('joinGroupModal');
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
                .single();
            
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
                .single();
            
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
        switchTab('goalsTab');
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
            
            if (groupIds.length > 0) {
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
        
        if (goals.length === 0) {
            goalsList.innerHTML = '<div class="empty-state"><p>🎯 No goals yet.</p><p style="margin-top: 10px; font-size: 0.9rem;">Create your first goal to start tracking your progress!</p></div>';
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
        
        goalsList.innerHTML = goals.map(goal => {
            const progressCount = progressCounts[goal.id] || 0;
            const progressPercent = goal.target_days ? Math.min((progressCount / goal.target_days) * 100, 100) : 0;
            const groupName = goal.groups ? ` • ${escapeHtml(goal.groups.name)}` : '';
            const isOwner = goal.user_id === currentUser?.id;
            
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

    // Create goal
    document.getElementById('createGoalBtn')?.addEventListener('click', () => {
        updateGoalGroupDropdown();
        openModal('createGoalModal');
    });

    document.getElementById('createGoalForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
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
        if (!goal) {
            // Try to fetch if not in cache
            const { data: fetchedGoal } = await supabase
                .from('goals')
                .select('*')
                .eq('id', goalId)
                .single();
            
            if (!fetchedGoal) {
                showStatus('Goal not found', 'error');
                return;
            }
        }
        
        currentViewingGoalId = goalId; // Store for comment reload
        const goalToShow = goal || await supabase.from('goals').select('*').eq('id', goalId).single().then(r => r.data);
        
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

    // Make functions global for onclick handlers
    window.viewGroup = viewGroup;
    window.viewGoalDetails = viewGoalDetails;
    window.openLogProgress = (goalId) => {
        document.getElementById('progressGoalId').value = goalId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        document.getElementById('progressDate').valueAsDate = today;
        document.getElementById('progressDate').max = new Date().toISOString().split('T')[0]; // Prevent future dates
        closeModal('goalDetailsModal');
        openModal('logProgressModal');
    };
    
    window.addComment = async (progressId) => {
        const input = document.getElementById(`comment-${progressId}`);
        const content = input.value.trim();
        if (!content) {
            showStatus('Please enter a comment', 'error');
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const submitBtn = input.nextElementSibling;
        const originalText = submitBtn.textContent;
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
            showStatus('Comment added successfully!', 'success');
            
            // Reload goal details using stored goalId
            if (currentViewingGoalId) {
                await viewGoalDetails(currentViewingGoalId);
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            showStatus(getErrorMessage(error), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
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

    // Delete progress entry
    window.deleteProgressEntry = async (entryId, goalId) => {
        if (!confirm('Are you sure you want to delete this progress entry? This will also delete all comments on this entry.')) {
            return;
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
            if (goalId) {
                await viewGoalDetails(goalId);
            }
            loadGoals(true);
            loadProgress(true);
        } catch (error) {
            console.error('Error deleting progress entry:', error);
            showStatus(getErrorMessage(error), 'error');
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
                .single();
            
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
}
