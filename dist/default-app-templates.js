angular.module("cyphy.default.templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("/default/templates/WorkspaceDetails.html","<div>\r\n    <h1>Workspace details</h1>\r\n    <hr/>\r\n    <div ui-view></div>\r\n</div>");
$templateCache.put("/default/templates/Workspaces.html","<div>\r\n    <h1>Workspaces</h1>\r\n\r\n    <workspace-list></workspace-list>\r\n</div>");}]);