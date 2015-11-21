/**
 * This is the entry point for the Narrative's front-end. It initializes
 * the login session, fires up the data and function widgets, and creates
 * the kbaseNarrativeWorkspace wrapper around the IPython notebook that
 * does fun things like manage widgets and cells and kernel events to talk to them.
 *
 * To set global variables, use: IPython.narrative.<name> = value
 */
define([
    'jquery', 
    'narrativeConfig',
    'kbaseNarrativeSidePanel', 
    'kbaseNarrativeOutputCell', 
    'kbaseNarrativeWorkspace',
    'kbaseNarrativeMethodCell',
    'narrativeLogin',
    'kbase-client-api',
    'kbaseNarrativePrestart',
    'ipythonCellMenu',
    'base/js/events',
    'notebook/js/notebook'
], function($,
            Config,
            kbaseNarrativeSidePanel,
            kbaseNarrativeOutputCell,
            kbaseNarrativeWorkspace,
            kbaseNarrativeMethodCell,
            narrativeLogin,
            kbaseClient,
            kbaseNarrativePrestart,
            kbaseCellToolbar,
            events,
            Notebook) {
    "use strict";

    /**
     * @constructor
     * The base, namespaced Narrative object. This is mainly used at start-up time, and
     * gets injected into the IPython namespace.
     * 
     * Most of its methods below - init, registerEvents, initAboutDialog, initUpgradeDialog,
     * checkVersion, updateVersion - are set up at startup time.
     * This is all done by an injection into static/notebook/js/main.js where the
     * Narrative object is set up, and Narrative.init is run.
     *
     * But, this also has a noteable 'Save' method, that implements another Narrative-
     * specific piece of functionality. See Narrative.prototype.saveNarrative below.
     */
    var Narrative = function() {
        this.maxNarrativeSize = "4 MB";
        this.narrController = null;
        this.readonly = false; /* whether whole narrative is read-only */
        this.authToken = null;
        this.versionCheckTime = 6000*60*1000;
        this.versionHtml = 'KBase Narrative';
        this.selectedCell = null;
        this.currentVersion = Config.get('version');
        this.dataViewers = null;

        return this;
    };

    Narrative.prototype.makeKernelCall = function() {

    };

    // Wrappers for the IPython/Jupyter function so we only maintain it in one place.
    Narrative.prototype.disableKeyboardManager = function() {
        IPython.keyboard_manager.disable();
    };

    Narrative.prototype.enableKeyboardManager = function() {
        IPython.keyboard_manager.enable();
    };

    /**
     * @method
     * Shows the cell toolbar above the given non-KBase cell (e.g. only
     * code and markdown cells).
     * Updates the currently selected cell to be the one passed in.
     */
    Narrative.prototype.showIPythonCellToolbar = function(cell) {
        if (this.selectedCell && cell != this.selectedCell)
            this.selectedCell.celltoolbar.hide();
        this.selectedCell = cell;
        // show the new one
        if (this.selectedCell && !this.selectedCell.metadata['kb-cell'])
            this.selectedCell.celltoolbar.show();
    };

    /**
     * Registers Narrative responses to a few IPython events - mainly some
     * visual effects for managing when the cell toolbar should be shown, 
     * but it also disables the keyboard manager when KBase cells are selected.
     */
    Narrative.prototype.registerEvents = function() {
        $([IPython.events]).on('status_idle.Kernel',function () {
            $("#kb-kernel-icon").removeClass().addClass('fa fa-circle-o');
        });

        $([IPython.events]).on('status_busy.Kernel',function () {
            $("#kb-kernel-icon").removeClass().addClass('fa fa-circle');
        });

        $([IPython.events]).on('select.Cell', $.proxy(function(event, data) {
            this.showIPythonCellToolbar(data.cell);
            if (data.cell.metadata['kb-cell'])
                this.disableKeyboardManager();
        }, this));

        $([IPython.events]).on('create.Cell', $.proxy(function(event, data) {
            this.showIPythonCellToolbar(data.cell);
        }, this));

        $([IPython.events]).on('delete.Cell', $.proxy(function(event, data) {
            this.showIPythonCellToolbar(IPython.notebook.get_selected_cell());
            this.enableKeyboardManager();
        }, this));
    };

    /**
     * The "Upgrade your container" dialog should be made available when 
     * there's a more recent version of the Narrative ready to use. This
     * dialog then lets the user shut down their existing Narrative container.
     */
    Narrative.prototype.initUpgradeDialog = function() {
        var $newVersion = $('<span>')
                          .append('<b>No new version</b>');  // init to the current version
        var $cancelBtn = $('<button type="button" data-dismiss="modal">')
                         .addClass('btn btn-default')
                         .append('Cancel');
        var $upgradeBtn = $('<button type="button" data-dismiss="modal">')
                          .addClass('btn btn-success')
                          .append('Update and Reload')
                          .click($.proxy(function(e) {
                              this.updateVersion();
                          }, this));
        var $upgradeModal = $('<div tabindex=-1 role="dialog" aria-hidden="true">')
                            .addClass('modal fade')
                            .append($('<div>')
                                    .addClass('modal-dialog')
                                    .append($('<div>')
                                        .addClass('modal-content')
                                        .append($('<div>')
                                                .addClass('modal-header')
                                                .append($('<h4>')
                                                        .addClass('modal-title')
                                                        .attr('id', 'kb-version-label')
                                                        .append('New Narrative Version available!')))
                                        .append($('<div>')
                                                .addClass('modal-body')
                                                .append($('<span>').append('Your current version of the Narrative is <b>' + this.currentVersion + '</b>. Version '))
                                                .append($newVersion)
                                                .append($('<span>').append(' is now available.<br><br>' + 
                                                                           'See <a href="' + Config.get('release_notes') + '" target="_blank">here</a> for current release notes.<br>' +
                                                                           'Click "Update and Reload" to reload with the latest version!<br><br>' + 
                                                                           '<b>Any unsaved data in any open Narrative in any window WILL BE LOST!</b>')))
                                        .append($('<div>')
                                                .addClass('modal-footer')
                                                .append($('<div>')
                                                        .append($cancelBtn)
                                                        .append($upgradeBtn)))));
        $('#kb-update-btn').click(function(event) {
            $upgradeModal.modal('show');
        });
        this.checkVersion($newVersion);
        // ONLY CHECK AT STARTUP FOR NOW.
        // setInterval(function() {
        //     self.checkVersion($newVersion);
        // }, this.versionCheckTime);
    };

    /**
     * Looks up what is the current version of the Narrative.
     * This should eventually get rolled into a Narrative Service method call.
     */
    Narrative.prototype.checkVersion = function($newVersion) {
        // look up new version here.
        var self = this;
        $.ajax({
            url: Config.url('version_check'),
            async: true,
            dataType: 'text',
            crossDomain: true,
            cache: false,
            success: function(ver) {
                ver = $.parseJSON(ver);
                if (self.currentVersion !== ver.version) {
                    $newVersion.empty().append('<b>' + ver.version + '</b>');
                    $('#kb-update-btn').fadeIn('fast'); 
                }
            },
            error: function(err) {
                console.log('Error while checking for a version update: ' + err.statusText);
                KBError('Narrative.checkVersion', 'Unable to check for a version update!');
            },
        });
    };

    Narrative.prototype.initAboutDialog = function() {
        var $versionDiv = $('<div>')
                          .append('<b>Version:</b> ' + Config.get('version'));
        $versionDiv.append('<br><b>Git Commit:</b> ' + Config.get('git_commit_hash') + ' -- ' + Config.get('git_commit_time'));
        $versionDiv.append('<br>View release notes on <a href="' + Config.get('release_notes') + '" target="_blank">Github</a>');

        var urlList = Object.keys(Config.get('urls')).sort();
        var $versionTable = $('<table>')
                            .addClass('table table-striped table-bordered');
        $.each(urlList,
            function(idx, val) {
                var url = Config.url(val).toString();
                // if url looks like a url (starts with http), include it.
                // ignore job proxy and submit ticket
                if (val === 'narrative_job_proxy' || val === 'submit_jira_ticket')
                    return;
                if (url && url.toLowerCase().indexOf('http') == 0) {
                    var $testTarget = $('<td>');
                    $versionTable.append($('<tr>')
                                         .append($('<td>').append(val))
                                         .append($('<td>').append(url)));
                }
            }
        );
        var $verAccordion = $('<div style="margin-top:15px">');
        $verAccordion.kbaseAccordion({
            elements: [{
                title: 'KBase Service URLs',
                body: $versionTable
            }]
        })
        $versionDiv.append($verAccordion);

        var $shutdownButton = $('<button>')
                              .attr({'type':'button', 'data-dismiss':'modal'})
                              .addClass('btn btn-danger')
                              .append('Okay. Shut it all down!')
                              .click($.proxy(function(e) {
                                  this.updateVersion();
                              }, this));
        var $reallyShutdownPanel = $('<div style="margin-top:10px">')
                                   .append('This will shutdown your Narrative session and close this window.<br><b>Any unsaved data in any open Narrative in any window WILL BE LOST!</b><br>')
                                   .append($shutdownButton)
                                   .hide();

        var $firstShutdownBtn = $('<button>')
                                .attr({'type':'button'})
                                .addClass('btn btn-danger')
                                .append('Shutdown')
                                .click(function(e) {
                                    $reallyShutdownPanel.slideDown('fast');
                                });

        var $versionModal = $('<div tabindex=-1 role="dialog" aria-labelledby="kb-version-label" aria-hidden="true">')
                            .addClass('modal fade')
                            .append($('<div>')
                                    .addClass('modal-dialog')
                                    .append($('<div>')
                                        .addClass('modal-content')
                                        .append($('<div>')
                                                .addClass('modal-header')
                                                .append($('<h4>')
                                                        .addClass('modal-title')
                                                        .attr('id', 'kb-version-label')
                                                        .append('KBase Narrative Properties')))
                                        .append($('<div>')
                                                .addClass('modal-body')
                                                .append($versionDiv))
                                        .append($('<div>')
                                                .addClass('modal-footer')
                                                .append($('<div>')
                                                        .append($('<button type="button" data-dismiss="modal">')
                                                                .addClass('btn btn-default')
                                                                .append('Dismiss')
                                                                .click(function(e) {
                                                                    $reallyShutdownPanel.hide();
                                                                }))
                                                        .append($firstShutdownBtn))
                                                .append($reallyShutdownPanel))));

        $('#kb-about-btn').click(function(event) {
            $versionModal.modal('show');
        });
        $('#notebook').append($versionModal);
    };

    // This should not be run until AFTER the notebook has been loaded!
    // It depends on elements of the Notebook metadata.
    Narrative.prototype.init = function() {
        this.registerEvents();
        this.initAboutDialog();
        this.initUpgradeDialog();

        // Override the base IPython event that happens when a notebook fails to save.
        $([IPython.events]).on('notebook_save_failed.Notebook', $.proxy(function(event, data) {
            IPython.save_widget.set_save_status('Narrative save failed!');
            console.log(event);
            console.log(data);

            var errorText;
            // 413 means that the Narrative is too large to be saved.
            // currently - 4/6/2015 - there's a hard limit of 4MB per KBase Narrative.
            // Any larger object will throw a 413 error, and we need to show some text.
            if (data.xhr.status === 413) {
                errorText = 'Due to current system constraints, a Narrative may not exceed ' + 
                            this.maxNarrativeSize + ' of text.<br><br>' +
                            'Errors of this sort are usually due to excessive size ' + 
                            'of outputs from Code Cells, or from large objects ' + 
                            'embedded in Markdown Cells.<br><br>' +
                            'Please decrease the document size and try to save again.';
            }
            else if (data.xhr.responseText) {
                var $error = $($.parseHTML(data.xhr.responseText));
                errorText = $error.find('#error-message > h3').text();

                if (errorText) {
                    /* gonna throw in a special case for workspace permissions issues for now.
                     * if it has this pattern:
                     * 
                     * User \w+ may not write to workspace \d+
                     * change the text to something more sensible.
                     */

                    var res = /User\s+(\w+)\s+may\s+not\s+write\s+to\s+workspace\s+(\d+)/.exec(errorText);
                    if (res) {
                        errorText = "User " + res[1] + " does not have permission to save to workspace " + res[2] + ".";
                    }
                }
            }
            else {
                errorText = 'An unknown error occurred!';
            }

            IPython.dialog.modal({
                title: "Narrative save failed!",
                body: $('<div>').append(errorText),
                buttons : {
                    "OK": {
                        class: "btn-primary",
                        click: function () {
                        }
                    }
                },
                open : function (event, ui) {
                    var that = $(this);
                    // Upon ENTER, click the OK button.
                    that.find('input[type="text"]').keydown(function (event, ui) {
                        if (event.which === utils.keycodes.ENTER) {
                            that.find('.btn-primary').first().click();
                        }
                    });
                    that.find('input[type="text"]').focus();
                }
            });
        }, this));

//        $('[data-toggle="tooltip"]').tooltip({
//            placement: 'auto',
//            delay: {show: 500, hide: 0}
//        });
        
        /*
         * Before we get everything loading, just grey out the whole %^! page
         */
        var $sidePanel = $('#kb-side-panel').kbaseNarrativeSidePanel({ autorender: false });

        // NAR-271 - Firefox needs to be told where the top of the page is. :P
        window.scrollTo(0,0);
        
        IPython.notebook.set_autosave_interval(0);
        kbaseCellToolbar.register(IPython.notebook);
        IPython.CellToolbar.activate_preset("KBase");
        IPython.CellToolbar.global_show();


        this.ws_name = null;

        if (IPython && IPython.notebook && IPython.notebook.metadata) {
            // hide all cell toolbars.
            // well trigger the one to show later.

            $.each(IPython.notebook.get_cells(), function(idx, cell) {
                cell.celltoolbar.hide();
            });

            this.ws_name = IPython.notebook.metadata.ws_name;
            var narrname = IPython.notebook.get_notebook_name();
            var username = IPython.notebook.metadata.creator;
            console.log(IPython.notebook.metadata);
            // $('#kb-narr-name #name').text(narrname);
            $('#kb-narr-creator').text(username);
            $('.kb-narr-namestamp').css({'display':'block'});

            var token = null;
            if (window.kb && window.kb.token)
                token = window.kb.token;

            $.ajax({
                type: 'GET',
                url: 'https://kbase.us/services/genome_comparison/users?usernames=' + username + '&token=' + token,
                dataType: 'json',
                crossDomain: true,
                success: function(data, res, jqXHR) {
                    if (username in data.data && data.data[username].fullName) {
                        var fullName = data.data[username].fullName;
                        $('#kb-narr-creator').text(fullName + ' (' + username + ')');
                    }
                }
            });

            // This puts the cell menu in the right place.
            $([IPython.events]).trigger('select.Cell', {cell: IPython.notebook.get_selected_cell()});
        }
        if (this.ws_name) {
            /* It's ON like DONKEY KONG! */
            $('a#workspace-link').attr('href', $('a#workspace-link').attr('href') + 'objects/' + this.ws_name);
            this.narrController = $('#notebook_panel').kbaseNarrativeWorkspace({
                loadingImage: "/static/kbase/images/ajax-loader.gif",
                ws_id: IPython.notebook.metadata.ws_name
            });
            $sidePanel.render();
            $(document).trigger('setWorkspaceName.Narrative', {'wsId' : this.ws_name, 'narrController': this.narrController});
        }
        else {
            KBFatal("Narrative.init", "Unable to locate workspace name from the Narrative object!");
        }
    };

    Narrative.prototype.updateVersion = function() {
        var user = $('#signin-button').kbaseLogin('session', 'user_id');
        var prom = $.ajax({
            contentType: 'application/json',
            url: '/narrative_shutdown/' + user,
            type: 'DELETE',
            crossDomain: true
        });
        prom.done(function(jqXHR, response, status) {
            setTimeout(function() { location.reload(true); }, 200);
        });
        prom.fail(function(jqXHR, response, error) {
            alert('Unable to update your Narrative session\nError: ' + jqXHR.status + ' ' + error);
        });
    };

    /**
     * @method
     * @public
     * This triggers a save, but does a few steps first:
     * ....or, it will soon.
     * for now, it just passes through to the usual save.
     */
    Narrative.prototype.saveNarrative = function() {
        IPython.notebook.save_checkpoint();
    };

    /**
     * @method
     * @public
     * Insert a new method into the narrative, set it as active, populate the
     * parameters, and run it.  This is useful for widgets that need to trigger
     * some additional narrative action, such as creating a FeatureSet from 
     * a selected set of Features in a widget, or computing a statistic on a 
     * subselection made from within a widget.
     */
    Narrative.prototype.createAndRunMethod = function(method_id, parameters) {
        //first make a request to get the method spec of a particular method
        //getFunctionSpecs.Narrative is implemented in kbaseNarrativeMethodPanel
        var request = { methods:[method_id] };
        var self = this;
        self.narrController.trigger('getFunctionSpecs.Narrative', [request,
            function(specs) {
                // do nothing if the method could not be found
                var errorMsg = 'Method '+method_id+' not found and cannot run.';
                if(!specs) { console.error(errorMsg); return; }
                if(!specs.methods) { console.error(errorMsg); return; }
                if(!specs.methods[method_id]) { console.error(errorMsg); return; }
                // put the method in the narrative by simulating a method clicked in kbaseNarrativeMethodPanel
                self.narrController.trigger('methodClicked.Narrative', specs.methods[method_id]);

                // the method initializes an internal method input widget, but rendering and initializing is
                // async, so we have to wait and check back before we can load the parameter state.
                // TODO: update kbaseNarrativeMethodCell to return a promise to mark when rendering is complete
                var newCell = IPython.notebook.get_selected_cell();
                var newCellIdx = IPython.notebook.get_selected_index();
                var newWidget = $('#'+$(newCell.get_text())[0].id).kbaseNarrativeMethodCell();
                var updateStateAndRun = function(state) {
                    if(newWidget.$inputWidget) {
                        // if the $inputWidget is not null, we are good to go, so set the parameters
                        newWidget.loadState(parameters);
                        // make sure the new cell is still selected, then run the method
                        IPython.notebook.select(newCellIdx);
                        newWidget.runMethod();
                    } else {
                        // not ready yet, keep waiting
                        window.setTimeout(updateStateAndRun,500);
                    }
                };
                // call the update and run after a short deplay
                window.setTimeout(updateStateAndRun,50);
            }
        ]);
    };


    return Narrative;
});