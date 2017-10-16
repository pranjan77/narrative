/**
 *  kbaseCard.js -- used for all modeling related modals
 *
 *  Authors:
 *      nconrad@anl.gov
 *
 *   This is a helper widget for rendering modals using bootstrap v3.0.0+
 *   The aim here is to have the simplest and maintainable API.
 *
 *   API
 *
 *   Basic Modal:
 *
 *      var modal =  new kbaseCard($('<div>'), {
 *         title: 'Model Details',
 *         subText: 'some subtext under title'
 *      });
 *
 *   See public methods below for rest of API.  It is self-documenting.
 *
*/

define (
    [
        'bootstrap',
        'util/icon',
        'bluebird',
        'util/bootstrapDialog',
        'util/timeFormat',
        'kbase/js/widgets/narrative_core/kbaseCardLayout',
        'narrativeConfig',
        'jquery'
    ], function(
        bootstrap,
        Icon,
        Promise,
        BootstrapDialog,
        TimeFormat,
        kbaseCardLayout,
        Config,
        $
    ) {
        function KbaseAppCard(entry) {
            var self = entry.self;
            var app = self.app;
            
            var shortName = entry.name ? entry.name : app[1];
            var version = entry.version ? entry.version : app[4];
            var date = entry.date ? entry.date : TimeFormat.getTimeStampStr(app[3]);
            var type = entry.type;
            var editBy = entry['edit-by'] ? entry['edit-by'] : (' by ' + app[5]);

            if(!entry.type){
                var type_tokens = app[2].split('.');
                type = entry.type ? entry.type : type_tokens[1].split('-')[0];
            }

            //shorten name if applicable
            var isShortened = false;
            if ((entry.max_name_length && shortName) && shortName.length > entry.max_name_length) {
                shortName = shortName.substring(0, entry.max_name_length - 3) + '...';
                isShortened = true;
            }

            var $logo = $('<div>');
            Icon.buildDataIcon($logo, type, entry.is_set, 0);
                
            var $name = $('<span>').addClass('kb-data-list-name').append(shortName);
            var $version = $('<span>').addClass('kb-data-list-version').append(version);
            var $type = $('<div>').addClass('kb-data-list-type').append(type);
            var $date = $('<span>').addClass('kb-data-list-date').append(date);

            //no default
            var $byUser = $('<span>').addClass('kb-data-list-edit-by').append(editBy);
            var $narrative = $('<div>').addClass('kb-data-list-narrative').append(entry.narrative);
            
            var $title = $('<div>').append($name);
            if(entry.version) $title.append($version);

            var $subcontent = $('<div>')
                .addClass('kb-data-list-subcontent')
                .append($type);
            if(entry.narrative) {
                $subcontent.append($narrative);
            }
            if(entry.date) {
                $subcontent.append($date);
            }


            if(entry['edit-by']) {
                $byUser
                    .click(function (app, e) {
                        e.stopPropagation();
                        window.open('/#people/' + app[5]);
                    }.bind( null, app));
                $subcontent.append($byUser);
            }

            //tooltip for long title
            if (isShortened) {
                $name.tooltip({
                    title: entry.name,
                    placement: 'bottom',
                    delay: {
                        show: Config.get('tooltip').showDelay,
                        hide: Config.get('tooltip').hideDelay
                    }
                });
            }
            //create card
            var actionButtonClick = function (e) {
                if(!entry.ws_name){
                    return;
                }
                e.preventPropagation; // probably should move action outside of render func, but oh well
                var updateButton = function () {
                    var thisBtn = $(this).children()[0];
                    var thisHolder = this;
                    $(this).html('<img src="' + self.options.loadingImage + '">');
                    Promise.resolve(self.serviceClient.sync_call(
                        'NarrativeService.copy_object',
                        [{
                            ref: app[6] + '/' + app[0],
                            target_ws_name: entry.ws_name,
                        }]
                    ))
                        .then(function () {
                            $(thisHolder).html('');
                            $(thisBtn).text(' Copy');
                            $(thisHolder).append(thisBtn);
                            self.trigger('updateDataList.Narrative');
                        })
                        .catch(function (error) {
                            $(thisBtn).html('Error');
                            if (error.error && error.error.message) {
                                if (error.error.message.indexOf('may not write to workspace') >= 0) {
                                    self.options.$importStatus.html($('<div>').css({ 'color': '#F44336', 'width': '500px' }).append('Error: you do not have permission to add data to this Narrative.'));
                                } else {
                                    self.options.$importStatus.html($('<div>').css({ 'color': '#F44336', 'width': '500px' }).append('Error: ' + error.error.message));
                                }
                            } else {
                                self.options.$importStatus.html($('<div>').css({ 'color': '#F44336', 'width': '500px' }).append('Unknown error!'));
                            }
                            console.error(error);
                        });
                };
                if ($(this).text().split(' ')[1] === 'Copy') {
                    var dialog = new BootstrapDialog({
                        title: 'Item already exists in workspace under same name.',
                        body: 'Do you want to override the existing copy?',
                        buttons: [$('<a type="button" class="btn btn-default">')
                            .append('Yes')
                            .click(function () {
                                dialog.hide();
                                updateButton.call(this);

                            }.bind(this))
                            , $('<a type="button" class="btn btn-default">')
                            .append('No')
                            .click(function () {
                                dialog.hide();
                            })
                        ],
                        closeButton: true
                    });
                    dialog.show();
                } else {
                    updateButton.call(this);
                }

            };
            var layout = {
                actionButton: entry.actionButton,
                actionButtonClick: actionButtonClick,
                logo: $logo,
                title: $title,
                subcontent: $subcontent,
                moreContent : entry.moreContent
            };

            var $card = new kbaseCardLayout(layout);

            var $renderedActionButton = $card.find('.narrative-card-action-button');
            $renderedActionButton.addClass(function () { return app[1].split('.').join('--'); })
                .hide();

            return $card;
        }
        return KbaseAppCard;  //end init
    });
