package com.ailearninghub.catalog;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('CONTENT_ADMIN')")
public class CatalogAdminController {
  private final CatalogService catalog;
  public CatalogAdminController(CatalogService catalog) { this.catalog = catalog; }

  @GetMapping("/paths") List<CatalogDtos.PathItem> paths() { return catalog.adminPaths(); }
  @PostMapping("/paths") @ResponseStatus(HttpStatus.CREATED) CatalogDtos.PathItem createPath(@Valid @RequestBody CatalogDtos.PathRequest request) { return catalog.createPath(request); }
  @PatchMapping("/paths/{id}") CatalogDtos.PathItem updatePath(@PathVariable Long id, @Valid @RequestBody CatalogDtos.PathRequest request) { return catalog.updatePath(id, request); }
  @PostMapping("/paths/{id}/publish") CatalogDtos.PathItem publishPath(@PathVariable Long id) { return catalog.publishPath(id); }
  @PostMapping("/paths/{id}/archive") CatalogDtos.PathItem archivePath(@PathVariable Long id) { return catalog.archivePath(id); }

  @GetMapping("/courses") List<CatalogDtos.CourseItem> courses() { return catalog.adminCourses(); }
  @PostMapping("/courses") @ResponseStatus(HttpStatus.CREATED) CatalogDtos.CourseItem createCourse(@Valid @RequestBody CatalogDtos.CourseRequest request) { return catalog.createCourse(request); }
  @PatchMapping("/courses/{id}") CatalogDtos.CourseItem updateCourse(@PathVariable Long id, @Valid @RequestBody CatalogDtos.CourseRequest request) { return catalog.updateCourse(id, request); }
  @PostMapping("/courses/{id}/publish") CatalogDtos.CourseItem publishCourse(@PathVariable Long id) { return catalog.publishCourse(id); }
  @PostMapping("/courses/{id}/archive") CatalogDtos.CourseItem archiveCourse(@PathVariable Long id) { return catalog.archiveCourse(id); }

  @GetMapping("/knowledge-points") List<CatalogDtos.KnowledgePointItem> knowledgePoints() { return catalog.adminKnowledgePoints(); }
  @PostMapping("/knowledge-points") @ResponseStatus(HttpStatus.CREATED) CatalogDtos.KnowledgePointItem createKnowledgePoint(@Valid @RequestBody CatalogDtos.KnowledgePointRequest request) { return catalog.createKnowledgePoint(request); }
  @PatchMapping("/knowledge-points/{id}") CatalogDtos.KnowledgePointItem updateKnowledgePoint(@PathVariable Long id, @Valid @RequestBody CatalogDtos.KnowledgePointRequest request) { return catalog.updateKnowledgePoint(id, request); }
  @PostMapping("/knowledge-points/{id}/publish") CatalogDtos.KnowledgePointItem publishKnowledgePoint(@PathVariable Long id) { return catalog.publishKnowledgePoint(id); }
  @PostMapping("/knowledge-points/{id}/archive") CatalogDtos.KnowledgePointItem archiveKnowledgePoint(@PathVariable Long id) { return catalog.archiveKnowledgePoint(id); }
}
