var functionProxy = require('function-proxy');

var ANIMATION_DURATION = 300,
    MODAL_MASK_CLICK_TOLERANCE = 1000,
    TOP_OFFSET_INCREMENT = 10,
    stack = [];

function register(win) {
    deregister(win);
    var topWin = stack.get('lastObject');
    if (topWin) {
        win.set('zIndex', topWin.get('zIndex') + 10);
    } else {
        win.set('zIndex', 2000);
    }
    if (win.get('win') === null) {
        win.set('topOffset', topWin ? TOP_OFFSET_INCREMENT + topWin.get('topOffset') : 0);
    }
    stack.pushObject(win);
}

function deregister(win) {
    stack.removeObject(win);
}

module.exports = Em.Component.extend({
    layout: require('../templates/window-layout'),

    classNames: ['window', 'layer'],

    classNameBindings: ['closable:window-closable', 'animated:window-animated'],

    attributeBindings: ['style'],

    animated: true,

    animationDuration: function() {
        return this.get('animated') ? ANIMATION_DURATION : 0;
    }.property('animated'),

    viewportPadding: 10,

    topOffset: null,

    title: '',

    isModal: true,

    focusSelector: ':input:not([disabled]):first',

    modalMask: null,

    closable: true,

    zIndex: null,

    width: 500,

    isClosing: false,

    willClose: function() {

    },

    init: function() {
        this._super();
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
            var modalMask = this.get('modalMask'); //this window may have replaced another window and inherited its modal mask
            if (!modalMask) {
                modalMask = this.container.lookup('component:modal-mask');
                this.set('modalMask', modalMask);
                modalMask.set('zIndex', this.get('zIndex') - 1);
                modalMask.show();
            }
            //Wait a second until listening for click events on modal mask. If user double clicks on an item which opens
            //the window, we don't want to hide it again, which the second click would otherwise do.
            modalMask.on('click', this, this.didClickModalMask);
            setTimeout(function() {

            }, 1000);
        }
        return new Em.RSVP.Promise(function(resolve) {
            self.one('didShow', function() {
                resolve();
            });
        });
    },

    didClickModalMask: function() {
        if (Date.now() - this.get('modalMask.insertTime') >= MODAL_MASK_CLICK_TOLERANCE) {
            if (this.get('closable')) {
                this.cancel();
            } else {
                this._pulse();
            }
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

    replaceWith: function(other) {
        var modalMask = this.get('modalMask');
        if (modalMask) {
            other.set('modalMask', modalMask);
            this.set('modalMask', null);
            modalMask.off('click', this, this.didClickModalMask);
        }

        other.set('topOffset', this.get('topOffset'));

        this.set('animated', false);
        other.set('animated', false);
        other.one('didShow', function() {
            other.set('animated', true);
        });

        this.cancel();
    },

    willDestroy: function() {
        deregister(this);

        var modalMask = this.get('modalMask');
        if (modalMask && !modalMask.get('isAnimateDestroying')) {
            modalMask.destroy();
        }
    },

    top: function() {
        return this.get('viewportPadding') + this.get('topOffset');
    }.property('topOffset'),

    didInsertElement: function() {
        this._super();
        var el = this.$(),
            focusSelector = this.get('focusSelector');
        this._sizeBody();
        $(window).on('resize', functionProxy(this._sizeBody, this));
        el.css('top', this.get('top') + 'px');
        el.addClass('visible');
        Em.run.later(this, function() {
            this.trigger('didShow');
        }, this.get('animationDuration'));
        if (focusSelector) {
            Em.run.next(this, function() {
                this.$(focusSelector).focus();
            }, 0);
        }
    },

    willDestroyElement: function() {
        this._super();
        $(window).off('resize', functionProxy(this._sizeBody, this));
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
            }, self.get('animationDuration'));
        });
    },

    didKeyDown: function(e) {
        var key = e.keyCode || e.which;
        switch (key) {
            case $.keyCode.ESCAPE:
                //Close the window on escape
                e.preventDefault();
                this.cancel();
                break;
            case $.keyCode.TAB:
                //Prevent tabbing outside the window
                var tabbable = this.$(':tabbable'),
                    finalTabbable = tabbable[e.shiftKey ? 'first' : 'last']()[0];
                if (finalTabbable === document.activeElement) {
                    e.preventDefault();
                    tabbable[e.shiftKey ? 'last' : 'first']()[0].focus();
                }
                break;
        }
    }.on('keyDown'),

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