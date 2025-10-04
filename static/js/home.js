// Home Page JavaScript
class HomePage {
    constructor() {
        this.init();
    }

    async init() {
        await this.loadStats();
        await this.loadRecentActivity();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Smooth scrolling for navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.getAttribute('href').startsWith('#')) {
                    e.preventDefault();
                    const target = document.querySelector(link.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                }
            });
        });

        // Add hover effects to feature cards
        document.querySelectorAll('.feature-card').forEach(card => {
            card.addEventListener('mouseenter', this.handleCardHover);
            card.addEventListener('mouseleave', this.handleCardLeave);
        });

        // Add click animations to buttons
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', this.handleButtonClick);
        });
    }

    handleCardHover(e) {
        e.target.style.transform = 'translateY(-8px) scale(1.02)';
    }

    handleCardLeave(e) {
        e.target.style.transform = 'translateY(0) scale(1)';
    }

    handleButtonClick(e) {
        const button = e.target;
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
            button.style.transform = 'scale(1)';
        }, 150);
    }

    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            if (response.ok) {
                const stats = await response.json();
                this.updateStats(stats);
            } else {
                // If API not available, show placeholder stats
                this.updateStats({
                    files_count: 0,
                    courses_count: 0,
                    notes_count: 0,
                    study_time: 0
                });
            }
        } catch (error) {
            console.log('Stats API not available, using placeholders');
            this.updateStats({
                files_count: 0,
                courses_count: 0,
                notes_count: 0,
                study_time: 0
            });
        }
    }

    updateStats(stats) {
        this.animateCounter('files-count', stats.files_count || 0);
        this.animateCounter('courses-count', stats.courses_count || 0);
        this.animateCounter('notes-count', stats.notes_count || 0);
        
        const studyTimeElement = document.getElementById('study-time');
        if (studyTimeElement) {
            const hours = Math.floor((stats.study_time || 0) / 3600);
            studyTimeElement.textContent = `${hours}h`;
        }
    }

    animateCounter(elementId, targetValue) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const duration = 1500;
        const startTime = Date.now();
        const startValue = 0;

        const animate = () => {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function for smooth animation
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            
            const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuart);
            element.textContent = currentValue.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    async loadRecentActivity() {
        try {
            const response = await fetch('/api/recent-activity');
            if (response.ok) {
                const activities = await response.json();
                this.updateRecentActivity(activities);
            }
        } catch (error) {
            console.log('Recent activity API not available');
            // Keep default welcome message
        }
    }

    updateRecentActivity(activities) {
        const activityList = document.getElementById('recent-activity');
        if (!activityList || !activities.length) return;

        activityList.innerHTML = '';
        
        activities.slice(0, 5).forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            
            const icon = this.getActivityIcon(activity.type);
            const timeAgo = this.formatTimeAgo(activity.timestamp);
            
            activityItem.innerHTML = `
                <i class="fas ${icon}"></i>
                <span>${activity.message}</span>
                <small style="margin-left: auto; color: #666;">${timeAgo}</small>
            `;
            
            activityList.appendChild(activityItem);
        });
    }

    getActivityIcon(type) {
        const icons = {
            'download': 'fa-download',
            'study': 'fa-book-open',
            'note': 'fa-sticky-note',
            'chat': 'fa-comments',
            'default': 'fa-info-circle'
        };
        return icons[type] || icons.default;
    }

    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffInSeconds = Math.floor((now - time) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }
}

// Initialize home page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HomePage();
});

// Add some visual enhancements
document.addEventListener('DOMContentLoaded', () => {
    // Add parallax effect to hero section
    const hero = document.querySelector('.hero');
    if (hero) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const rate = scrolled * -0.5;
            hero.style.transform = `translateY(${rate}px)`;
        });
    }

    // Add fade-in animation for feature cards
    const observeCards = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.feature-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'all 0.6s ease';
        observeCards.observe(card);
    });
});
