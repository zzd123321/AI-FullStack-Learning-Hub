package com.ailearninghub.catalog;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {
  private final CatalogService catalog;
  public CatalogController(CatalogService catalog) { this.catalog = catalog; }

  @GetMapping("/paths") List<CatalogDtos.PathItem> paths() { return catalog.publicPaths(); }
  @GetMapping("/paths/{id}") CatalogDtos.PathDetail path(@PathVariable Long id) { return catalog.publicPath(id); }
  @GetMapping("/courses/{id}") CatalogDtos.CourseDetail course(@PathVariable Long id) { return catalog.publicCourse(id); }
  @GetMapping("/knowledge-points/{id}") CatalogDtos.KnowledgePointItem knowledgePoint(@PathVariable Long id) { return catalog.publicKnowledgePoint(id); }
}
