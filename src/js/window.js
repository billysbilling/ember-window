var stack = [];

function register(win) {
    deregister(win);
    var top = stack.get('lastObject');
    if (top) {
        win.set('zIndex', top.get('zIndex') + 10);
    } else {
        win.set('zIndex', 2000);
    }
    stack.pushObject(win);
}

function deregister(win) {
    stack.removeObject(win);
}

module.exports = Em.Component.extend({
    layout: require('../templates/window-layout'),
    
    classNames: ['window', 'layer'],

    classNameBindings: ['closable:window-closable'],
    
    attributeBindings: ['style'],
    
    viewportPadding: 10,

    topOffset: null,

    title: '',

    isModal: true,

    focusSelector: null,

    modalMask: null,

    closable: true,

    zIndex: null,

    width: 500,
    
    isClosing: false,

    willClose: function() {

    },

    init: function() {
        this._super();
        var topWin = stack.get('lastObject');
        this.set('topOffset', topWin ? 10 + topWin.get('topOffset') : 0);
        register(this);
    },

    style: function() {
        var s = [],
            zIndex = this.get('zIndex'),
            width = this.get('width');
        s.push('z-index:'+zIndex+';');
        s.push('width:'+width+'px;');
        s.push('margin-left:-'+(width/2)+'px;');
        return s.join(' ');
    }.property('zIndex', 'width'),
    
    show: function() {
        var self = this;
        this.appendTo(this.container.lookup('application:main').get('rootElement'));
        if (this.get('isModal')) {
            var modalMask = this.container.lookup('component:modal-mask');
            this.set('modalMask', modalMask);
            modalMask.set('zIndex', this.get('zIndex') - 1);
            modalMask.show();
            //Wait a second until listening for click events on modal mask. If user double clicks on an item which opens
            //the window, we don't want to hide it again, which the second click would otherwise do. 
            setTimeout(function() {
                modalMask.on('click', function() {
                    if (self.get('closable')) {
                        self.cancel();
                    } else {
                        self._pulse();
                    }
                });
            }, 1000);
        }
    },
    
    cancel: function() {
        if (this.trigger('willCancel') === false) {
            return;
        }
        this.one('didClose', function() {
            this.trigger('didCancel');
        });
        this.close();
    },

    close: function() {
        var self = this,
            willClosePromise = this.trigger('willClose');

        if (!willClosePromise) {
            return this.doClose();
        }
        return willClosePromise.then(function() {
            return self.doClose();
        });
    },

    doClose: function() {
        var self = this;
        this.set('isClosing', true);
        return this.animateDestroy().then(function() {
            self.trigger('didClose');
            self.destroy();
        });
    },

    willDestroy: function() {
        deregister(this);
    },

    top: function() {
        return this.get('viewportPadding') + this.get('topOffset');
    }.property('topOffset'),

    didInsertElement: function() {
        this._super();
        var self = this,
            el = this.$(),
            focusSelector = this.get('focusSelector');
        this._sizeBody();
        $(window).on('resize', Billy.proxy(this._sizeBody, this));
        el.css('top', this.get('top') + 'px');
        setTimeout(function() {
            el.addClass('visible');
            if (focusSelector) {
                self.$(focusSelector).focus();
            }
        }, 0);
    },
    
    willDestroyElement: function() {
        this._super();
        $(window).off('resize', Billy.proxy(this._sizeBody, this));
    },

    _sizeBody: function() {
        var body = this.$('.window-body'),
            h = ($(window).height() - this.get('top') - this.get('viewportPadding') - (this.$().outerHeight() - body.outerHeight()));
        body.css('max-height', h+'px');
    },

    _pulse: function() {
        var el = this.$();
        el.addClass('pulse');
        setTimeout(function() {
            el.removeClass('pulse');
        }, 100);
    },

    animateDestroy: function() {
        var self = this;
        return new Em.RSVP.Promise(function(resolve) {
            var modalMask = self.get('modalMask'),
                el = self.$();
            if (modalMask) {
                modalMask.animateDestroy();
            }
            el.removeClass('visible');
            Em.run.later(self, function() {
                self.destroy();
                resolve();
            }, 300);
        });
    },
    
    actions: {
        cancel: function() {
            this.cancel();
        },
        close: function() {
            this.close();
        }
    },

    //Hack since Ember.Component does not support {{yield}} when there is no parentView
    _yield: function() {
        return Em.View.prototype._yield.apply(this, arguments);
    }
});

module.exports.hasWindows = function() {
    return stack.length > 0 && stack.any(function(w) { return !w.get('isClosing'); });
};